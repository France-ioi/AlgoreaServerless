/**
 * Migration script: copies connection and live-activity-subscription items from the old
 * single DynamoDB table to the new dedicated connections table.
 *
 * The old table stores 4 entry types for connections:
 *   - c2u:       pk=${stage}#CONN#${connId}#USER, sk=0
 *   - u2c:       pk=${stage}#USER#${userId}#CONN, sk=<encoded connId>   (skipped, replaced by GSI)
 *   - presence:  pk=${stage}#CONNECTED_USERS, sk=<userId>               (skipped, replaced by scan+dedup)
 *   - live act.: pk=${stage}#LIVE_ACTIVITY#SUB, sk=<encoded connId>     (merged as attribute on connection item)
 *
 * The new table has one item per connection: { connectionId, userId, creationTime, ttl, ... }
 * with an optional liveActivityPk attribute for live-activity subscribers.
 *
 * Usage:
 *   npx ts-node scripts/migrate-connections.ts <stage> <source-table-name> [--profile <name>] [--region <region>] [--dry-run]
 *
 * Example:
 *   npx ts-node scripts/migrate-connections.ts fioi-prod alg-serverless-fioi-prod --profile fioi --dry-run
 *   npx ts-node scripts/migrate-connections.ts dev alg-serverless-dev --profile franceioi-dev --region eu-west-3
 */

/* eslint-disable no-console, @typescript-eslint/naming-convention */

import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand, NumberValue } from '@aws-sdk/lib-dynamodb';

const BATCH_SIZE = 25; // DynamoDB BatchWriteItem limit

const LIVE_ACTIVITY_PK = 'LIVE_ACTIVITY_SUB';

const DEFAULT_REGION = 'eu-west-3';

interface MigrationStats {
  scanned: number,
  c2uMatched: number,
  liveActivityMatched: number,
  u2cSkipped: number,
  presenceSkipped: number,
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
      'Usage: npx ts-node scripts/migrate-connections.ts <stage> <source-table-name> [--profile <name>] [--region <region>] [--dry-run]',
    );
    process.exit(1);
  }

  return { stage: positional[0]!, sourceTable: positional[1]!, profile, region: region ?? DEFAULT_REGION, dryRun };
}

function extractConnectionId(pk: string, stage: string): string | undefined {
  const prefix = `${stage}#CONN#`;
  const suffix = '#USER';
  if (!pk.startsWith(prefix) || !pk.endsWith(suffix)) return undefined;
  return pk.slice(prefix.length, -suffix.length);
}

function numberValueToConnectionId(nv: NumberValue): string {
  let n = BigInt(nv.value);
  if (n === 0n) return Buffer.from([ 0 ]).toString('base64');
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  return Buffer.from(bytes).toString('base64');
}

function toPlainNumber(val: unknown): number | undefined {
  if (val instanceof NumberValue) return Number(val.value);
  if (typeof val === 'number') return val;
  return undefined;
}

async function migrate(): Promise<void> {
  const { stage, sourceTable, profile, region, dryRun } = parseArgs();
  const targetTable = `alg-sls-${stage}-connections`;

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

  const stats: MigrationStats = { scanned: 0, c2uMatched: 0, liveActivityMatched: 0, u2cSkipped: 0, presenceSkipped: 0, written: 0 };

  // Phase 1: Scan and collect connection items + live activity connectionIds
  const connectionItems = new Map<string, Record<string, unknown>>();
  const liveActivityConnectionIds = new Set<string>();

  const liveActivityPk = `${stage}#LIVE_ACTIVITY#SUB`;
  const u2cPrefix = `${stage}#USER#`;
  const u2cSuffix = '#CONN';
  const presencePk = `${stage}#CONNECTED_USERS`;

  let lastEvaluatedKey: Record<string, unknown> | undefined;

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

      // c2u entry: ${stage}#CONN#${connectionId}#USER
      const connectionId = extractConnectionId(pk, stage);
      if (connectionId) {
        stats.c2uMatched++;

        const newItem: Record<string, unknown> = { connectionId };
        for (const [ key, value ] of Object.entries(item)) {
          if (key === 'pk' || key === 'sk') continue;
          const plainNum = toPlainNumber(value);
          newItem[key] = plainNum !== undefined ? plainNum : value;
        }

        connectionItems.set(connectionId, newItem);
        continue;
      }

      // Live activity subscription: ${stage}#LIVE_ACTIVITY#SUB
      if (pk === liveActivityPk) {
        stats.liveActivityMatched++;
        const sk = item.sk;
        if (sk instanceof NumberValue) {
          const connId = numberValueToConnectionId(sk);
          liveActivityConnectionIds.add(connId);
        }
        continue;
      }

      // u2c entry (skipped)
      if (pk.startsWith(u2cPrefix) && pk.endsWith(u2cSuffix)) {
        stats.u2cSkipped++;
        continue;
      }

      // Presence entry (skipped)
      if (pk === presencePk) {
        stats.presenceSkipped++;
        continue;
      }
    }

    lastEvaluatedKey = output.LastEvaluatedKey as Record<string, unknown> | undefined;

    if (stats.scanned % 1000 === 0 && stats.scanned > 0) {
      console.log(`Progress: scanned=${stats.scanned}, c2u=${stats.c2uMatched}, liveActivity=${stats.liveActivityMatched}`);
    }
  } while (lastEvaluatedKey);

  // Phase 2: Merge live activity flags into connection items
  let liveActivityMerged = 0;
  for (const connId of liveActivityConnectionIds) {
    const item = connectionItems.get(connId);
    if (item) {
      item.liveActivityPk = LIVE_ACTIVITY_PK;
      liveActivityMerged++;
    } else {
      console.warn(`Live activity subscription for connectionId=${connId} has no matching connection item (orphaned)`);
    }
  }

  console.log(`\nMerged ${liveActivityMerged} live activity flags into connection items`);
  if (liveActivityConnectionIds.size > liveActivityMerged) {
    console.warn(`${liveActivityConnectionIds.size - liveActivityMerged} orphaned live activity subscriptions (no matching c2u entry)`);
  }

  // Phase 3: Write items to target table
  const allItems = Array.from(connectionItems.values());

  if (dryRun) {
    for (const item of allItems) {
      const hasLiveActivity = item.liveActivityPk !== undefined ? ' [live-activity]' : '';
      console.log(`[dry-run] Would write: connectionId=${String(item.connectionId)}, userId=${String(item.userId)}${hasLiveActivity}`);
    }
    stats.written = allItems.length;
  } else {
    for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
      const batch = allItems.slice(i, i + BATCH_SIZE);
      await writeBatch(client, targetTable, batch);
      stats.written += batch.length;
    }
  }

  console.log('---');
  console.log(`Done. Scanned: ${stats.scanned}, c2u matched: ${stats.c2uMatched}, live activity: ${stats.liveActivityMatched}`);
  console.log(`  u2c skipped: ${stats.u2cSkipped}, presence skipped: ${stats.presenceSkipped}`);
  console.log(`  Written: ${stats.written} (${liveActivityMerged} with live activity flag)`);
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
