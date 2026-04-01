/**
 * Migration script: copies Validations and ValidationCounts items from the old single
 * DynamoDB table to the new dedicated stats table with stage prefix removed from pk.
 *
 * Usage:
 *   npx ts-node scripts/migrate-stats.ts <stage> <source-table-name> [--profile <name>] [--region <region>] [--dry-run]
 *
 * Example:
 *   npx ts-node scripts/migrate-stats.ts fioi-prod alg-serverless-fioi-prod --profile fioi --dry-run
 *   npx ts-node scripts/migrate-stats.ts dev alg-serverless-dev --profile franceioi-dev --region eu-west-3
 */

/* eslint-disable no-console, @typescript-eslint/naming-convention */

import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const BATCH_SIZE = 25;

interface MigrationStats {
  scanned: number,
  matched: number,
  written: number,
}

const DEFAULT_REGION = 'eu-west-3';

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
      'Usage: npx ts-node scripts/migrate-stats.ts <stage> <source-table-name> [--profile <name>] [--region <region>] [--dry-run]',
    );
    process.exit(1);
  }

  return { stage: positional[0]!, sourceTable: positional[1]!, profile, region: region ?? DEFAULT_REGION, dryRun };
}

function matchStatsPk(pk: string, stage: string): string | undefined {
  const prefix = `${stage}#`;
  if (!pk.startsWith(prefix)) return undefined;
  const stripped = pk.slice(prefix.length);
  if (stripped === 'VALIDATIONS' || stripped === 'VALIDATIONS#DAY') return stripped;
  return undefined;
}

async function migrate(): Promise<void> {
  const { stage, sourceTable, profile, region, dryRun } = parseArgs();
  const targetTable = `alg-sls-${stage}-stats`;

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
  });

  const stats: MigrationStats = { scanned: 0, matched: 0, written: 0 };
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

      const newPk = matchStatsPk(pk, stage);
      if (!newPk) continue;

      stats.matched++;

      const newItem: Record<string, unknown> = { ...item, pk: newPk };

      if (dryRun) {
        console.log(`[dry-run] Would write: pk=${newPk}, sk=${String(item.sk)}`);
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
      console.log(`Progress: scanned=${stats.scanned}, matched=${stats.matched}, written=${stats.written}`);
    }
  } while (lastEvaluatedKey);

  if (batch.length > 0 && !dryRun) {
    await writeBatch(client, targetTable, batch);
    stats.written += batch.length;
  }

  console.log('---');
  console.log(`Done. Scanned: ${stats.scanned}, Matched: ${stats.matched}, Written: ${stats.written}`);
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
