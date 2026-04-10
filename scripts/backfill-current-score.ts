/**
 * Backfill script: sets `current_score` on every UserTaskStats entry that lacks it.
 *
 * For each entry, the score is determined by:
 * 1. Querying the last score row from the user-task-activities table (pk = score#itemId#groupId,
 *    reverse chronological). This gives the most recent (and thus highest) score.
 * 2. If no score rows exist but time_to_reach_100 is set, defaults to 100.
 * 3. Otherwise, uses the highest 10-point threshold with a time_to_reach_N set.
 *
 * Usage:
 *   npx ts-node scripts/backfill-current-score.ts <stage> [--profile <name>] [--region <region>] [--dry-run]
 *
 * Example:
 *   npx ts-node scripts/backfill-current-score.ts fioi-prod --profile fioi --dry-run
 *   npx ts-node scripts/backfill-current-score.ts dev --profile franceioi-dev --region eu-west-3
 */

/* eslint-disable no-console, @typescript-eslint/naming-convention */

import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const DEFAULT_REGION = 'eu-west-3';
const SCORE_THRESHOLDS = [ 100, 90, 80, 70, 60, 50, 40, 30, 20, 10 ] as const;

interface ParsedArgs {
  stage: string,
  profile: string | undefined,
  region: string,
  dryRun: boolean,
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const profileIdx = args.indexOf('--profile');
  let profile: string | undefined;
  if (profileIdx !== -1) {
    profile = args[profileIdx + 1];
    if (!profile || profile.startsWith('--')) {
      console.error('--profile requires a value');
      process.exit(1);
    }
  }

  const regionIdx = args.indexOf('--region');
  let region = DEFAULT_REGION;
  if (regionIdx !== -1) {
    region = args[regionIdx + 1]!;
    if (!region || region.startsWith('--')) {
      console.error('--region requires a value');
      process.exit(1);
    }
  }

  const namedIndices = new Set(
    [ profileIdx, profileIdx + 1, regionIdx, regionIdx + 1 ].filter(i => i >= 0),
  );
  const positional = args.filter((a, i) => a !== '--dry-run' && !namedIndices.has(i));

  if (positional.length !== 1) {
    console.error('Usage: npx ts-node scripts/backfill-current-score.ts <stage> [--profile <name>] [--region <region>] [--dry-run]');
    process.exit(1);
  }

  return { stage: positional[0]!, profile, region, dryRun };
}

function inferScoreFromThresholds(item: Record<string, unknown>): number {
  for (const t of SCORE_THRESHOLDS) {
    if (item[`time_to_reach_${t}`] !== undefined) return t;
  }
  return 0;
}

async function getLatestActivityScore(
  client: DynamoDBDocumentClient, activitiesTable: string, itemId: string, groupId: string,
): Promise<number | undefined> {
  const output = await client.send(new QueryCommand({
    TableName: activitiesTable,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `score#${itemId}#${groupId}` },
    ScanIndexForward: false,
    Limit: 1,
    ProjectionExpression: 'score',
  }));
  const item = output.Items?.[0];
  if (!item || typeof item.score !== 'number') return undefined;
  return item.score;
}

async function backfill(): Promise<void> {
  const { stage, profile, region, dryRun } = parseArgs();
  const statsTable = `alg-sls-${stage}-user-task-stats`;
  const activitiesTable = `alg-sls-${stage}-user-task-activities`;

  console.log(`Backfill current_score: ${statsTable}`);
  console.log(`Activities source: ${activitiesTable}`);
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

  let scanned = 0;
  let skipped = 0;
  let updated = 0;
  let fromActivity = 0;
  let fromThreshold = 0;
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const output = await client.send(new ScanCommand({
      TableName: statsTable,
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of (output.Items ?? []) as Record<string, unknown>[]) {
      scanned++;
      const itemId = item.itemId as string;
      const groupId = item.groupId as string;

      if (item.current_score !== undefined) {
        skipped++;
        continue;
      }

      let score = await getLatestActivityScore(client, activitiesTable, itemId, groupId);
      let source = 'activity';
      if (score === undefined) {
        score = inferScoreFromThresholds(item);
        source = 'threshold';
      }

      if (score === 0) {
        skipped++;
        continue;
      }

      if (source === 'activity') fromActivity++;
      else fromThreshold++;

      if (dryRun) {
        console.log(`[dry-run] ${itemId} / ${groupId}: current_score=${score} (${source})`);
      } else {
        await client.send(new UpdateCommand({
          TableName: statsTable,
          Key: { itemId, groupId },
          UpdateExpression: 'SET current_score = :s',
          ConditionExpression: 'attribute_not_exists(current_score)',
          ExpressionAttributeValues: { ':s': score },
        }));
      }
      updated++;
    }

    lastEvaluatedKey = output.LastEvaluatedKey as Record<string, unknown> | undefined;

    if (scanned % 500 === 0 && scanned > 0) {
      console.log(`Progress: scanned=${scanned}, updated=${updated}, skipped=${skipped}`);
    }
  } while (lastEvaluatedKey);

  console.log('---');
  console.log(
    `Done. Scanned: ${scanned}, Updated: ${updated} (activity: ${fromActivity}, threshold: ${fromThreshold}), Skipped: ${skipped}`,
  );
}

backfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
