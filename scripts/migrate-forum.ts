/**
 * Migration script: copies forum items (thread events, follows, subscriptions) from the old
 * single DynamoDB table to the new dedicated forum table with pk remapping.
 *
 * The old table stores forum items with pk patterns:
 *   - ${stage}#THREAD#${pid}#${iid}#EVENTS  (thread messages/events)
 *   - ${stage}#THREAD#${pid}#${iid}#FOLLOW  (user follows)
 *   - ${stage}#THREAD#${pid}#${iid}#SUB     (WS subscriptions)
 *
 * The new table keeps the same pk/sk schema but strips the ${stage}# prefix from pk values.
 *
 * Usage:
 *   npx ts-node scripts/migrate-forum.ts <stage> <source-table-name> [--profile <name>] [--region <region>] [--dry-run]
 *
 * Example:
 *   npx ts-node scripts/migrate-forum.ts fioi-prod alg-serverless-fioi-prod --profile fioi --dry-run
 *   npx ts-node scripts/migrate-forum.ts dev alg-serverless-dev --profile franceioi-dev --region eu-west-3
 */

/* eslint-disable no-console, @typescript-eslint/naming-convention */

import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand, NumberValue } from '@aws-sdk/lib-dynamodb';

const BATCH_SIZE = 25; // DynamoDB BatchWriteItem limit

const DEFAULT_REGION = 'eu-west-3';

interface MigrationStats {
  scanned: number,
  eventsMatched: number,
  followsMatched: number,
  subsMatched: number,
  written: number,
}

interface ParsedArgs {
  stage: string,
  sourceTable: string,
  profile: string | undefined,
  region: string,
  dryRun: boolean,
}

function parseNamedArg(args: string[], name: string): { value: string | undefined, idx: number } {
  const idx = args.indexOf(name);
  if (idx === -1) return { value: undefined, idx: -1 };
  const value = args[idx + 1];
  if (!value || value.startsWith('--')) {
    console.error(`${name} requires a value`);
    process.exit(1);
  }
  return { value, idx };
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const { value: profile, idx: profileIdx } = parseNamedArg(args, '--profile');
  const { value: region, idx: regionIdx } = parseNamedArg(args, '--region');

  const namedValueIndices = new Set(
    [ profileIdx, profileIdx + 1, regionIdx, regionIdx + 1 ].filter(i => i >= 0),
  );
  const positional = args.filter((a, i) => a !== '--dry-run' && !namedValueIndices.has(i));

  if (positional.length !== 2) {
    console.error(
      'Usage: npx ts-node scripts/migrate-forum.ts <stage> <source-table-name> [--profile <name>] [--region <region>] [--dry-run]',
    );
    process.exit(1);
  }

  return { stage: positional[0]!, sourceTable: positional[1]!, profile, region: region ?? DEFAULT_REGION, dryRun };
}

const FORUM_SUFFIXES = [ '#EVENTS', '#FOLLOW', '#SUB' ] as const;

type ForumType = 'events' | 'follows' | 'subs';

function classifyForumItem(pk: string, stagePrefix: string): ForumType | undefined {
  if (!pk.startsWith(stagePrefix)) return undefined;
  const rest = pk.slice(stagePrefix.length);
  if (!rest.startsWith('THREAD#')) return undefined;
  if (rest.endsWith(FORUM_SUFFIXES[0])) return 'events';
  if (rest.endsWith(FORUM_SUFFIXES[1])) return 'follows';
  if (rest.endsWith(FORUM_SUFFIXES[2])) return 'subs';
  return undefined;
}

function toPlainNumber(val: unknown): number | undefined {
  if (val instanceof NumberValue) return Number(val.value);
  if (typeof val === 'number') return val;
  return undefined;
}

async function migrate(): Promise<void> {
  const { stage, sourceTable, profile, region, dryRun } = parseArgs();
  const targetTable = `alg-sls-${stage}-forum`;
  const stagePrefix = `${stage}#`;

  console.log(`Migration: ${sourceTable} -> ${targetTable}`);
  console.log(`Stage: ${stage}, Region: ${region}`);
  if (profile) {
    process.env.AWS_PROFILE = profile;
    console.log(`AWS Profile: ${profile}`);
  }
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('---');

  const client = DynamoDBDocumentClient.from(new DynamoDB({ region }), {
    marshallOptions: { convertEmptyValues: true },
    unmarshallOptions: { wrapNumbers: true },
  });

  const stats: MigrationStats = { scanned: 0, eventsMatched: 0, followsMatched: 0, subsMatched: 0, written: 0 };
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  let batch: Record<string, unknown>[] = [];

  do {
    const output = await client.send(new ScanCommand({
      TableName: sourceTable,
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    const items = (output.Items ?? []) as Record<string, unknown>[];
    stats.scanned += items.length;

    for (const item of items) {
      const pk = item.pk as string | undefined;
      if (!pk) continue;

      const forumType = classifyForumItem(pk, stagePrefix);
      if (!forumType) continue;

      if (forumType === 'events') stats.eventsMatched++;
      else if (forumType === 'follows') stats.followsMatched++;
      else stats.subsMatched++;

      const newPk = pk.slice(stagePrefix.length);

      const newItem: Record<string, unknown> = { pk: newPk };
      for (const [ key, value ] of Object.entries(item)) {
        if (key === 'pk') continue;
        const plainNum = toPlainNumber(value);
        newItem[key] = plainNum !== undefined ? plainNum : value;
      }

      if (dryRun) {
        console.log(`[dry-run] Would write: pk=${newPk}, sk=${String(item.sk)}, type=${forumType}`);
        stats.written++;
        continue;
      }

      batch.push(newItem);

      if (batch.length >= BATCH_SIZE) {
        await writeBatch(client, targetTable, batch);
        stats.written += batch.length;
        batch = [];
      }
    }

    lastEvaluatedKey = output.LastEvaluatedKey as Record<string, unknown> | undefined;

    if (stats.scanned % 1000 === 0 && stats.scanned > 0) {
      const matched = stats.eventsMatched + stats.followsMatched + stats.subsMatched;
      console.log(`Progress: scanned=${stats.scanned}, matched=${matched}, written=${stats.written}`);
    }
  } while (lastEvaluatedKey);

  if (batch.length > 0 && !dryRun) {
    await writeBatch(client, targetTable, batch);
    stats.written += batch.length;
  }

  console.log('---');
  const totalMatched = stats.eventsMatched + stats.followsMatched + stats.subsMatched;
  console.log(`Done. Scanned: ${stats.scanned}, Matched: ${totalMatched}`);
  console.log(`  events: ${stats.eventsMatched}, follows: ${stats.followsMatched}, subs: ${stats.subsMatched}`);
  console.log(`  Written: ${stats.written}`);
}

async function writeBatch(client: DynamoDBDocumentClient, tableName: string, items: Record<string, unknown>[]): Promise<void> {
  await client.send(new BatchWriteCommand({
    RequestItems: {
      [tableName]: items.map(item => ({
        PutRequest: { Item: item },
      })),
    },
  }));
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
