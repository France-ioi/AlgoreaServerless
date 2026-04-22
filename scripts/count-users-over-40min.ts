/**
 * Counts distinct users who spent more than 40 minutes total across a given set of items.
 *
 * Usage:
 *   npx ts-node scripts/count-users-over-40min.ts <stage> [--profile <name>] [--region <region>]
 *
 * Example:
 *   npx ts-node scripts/count-users-over-40min.ts fioi-prod --profile fioi
 */

/* eslint-disable no-console, @typescript-eslint/naming-convention */

import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const DEFAULT_REGION = 'eu-west-3';
const FORTY_MINUTES_MS = 40 * 60 * 1000;

const ITEM_IDS = [
  '82725103326552981',
  '214209866470896580',
  '258406354432981613',
  '375767059213062491',
  '437379615981035416',
  '441521782087511308',
  '475354952594352051',
  '646203737194571671',
  '646969091839948273',
  '697907787195074688',
  '797659377594718726',
  '813861820678707454',
  '834599818176559011',
  '836403754424947805',
  '889653928994234111',
  '959748149436572146',
  '1007159486854604766',
  '1057157272087473929',
  '1147626333366199291',
  '1223675779920722976',
  '1261111633446790286',
  '1365010672059362477',
  '1385963521113297409',
  '1391024436112376564',
  '1424693484520806536',
  '1473070892132826512',
  '1476972650663109937',
  '1487266182516918389',
  '1493580404305203673',
  '1514897198159853680',
  '1538676909980395044',
  '1591708863125809758',
  '1736787437123954082',
  '1857700495010542950',
  '1959293542182678919',
  '1963373410170033827',
  '1980833121763769390',
  '1981132353960950857',
  '1990416675537688223',
  '2027373466024534235',
  '2074861181657975456',
  '2140985515842392895',
  '2191742810920202287',
  '2231992800335385729',
  '2299220769240065294',
  '2430373796480133895',
  '2437575888923385377',
  '2537913983947545573',
  '2547041282245030114',
  '2610046691497610511',
  '2611281209726714153',
  '2778316788801486315',
  '2843688118350081845',
  '2922940253347153917',
  '2996013662713898869',
  '3023706843238328664',
  '3053148985621072323',
  '3063633366982815416',
  '3066594951795105368',
  '3210297161124062868',
  '3210750962377581474',
  '3231366720437257767',
  '3245182139046515947',
  '3289699860957870449',
  '3291735099754288966',
  '3344157661643172812',
  '3348238745474190562',
  '3369461099817921618',
  '3478233448961863774',
  '3483221417765798768',
  '3504704702354655125',
  '3553222452513915211',
  '3588585433688248595',
  '3634083023584809271',
  '3652283157707584398',
  '3757013086112558694',
  '3986283624428166170',
  '4002510304029758010',
  '4017788974211503046',
  '4050935758904553026',
  '4105796640382198064',
  '4290217775468057685',
  '4348941794949753500',
  '4351627798818892444',
  '4384810417107988237',
  '4438835634819230094',
  '4462745652560602671',
  '4475632069344204204',
  '4495811683514970234',
  '4516490062502296696',
  '4581839383670955865',
  '4724859879013010535',
  '4805904593819209590',
  '4835176319259094662',
  '4897566371613734283',
  '4989074974737670167',
  '5043101273385260370',
  '5135351375262492074',
  '5168966035876038443',
  '5212933966891993080',
  '5246601394440832784',
  '5306917270279453079',
  '5331181543598991350',
  '5367622407973258528',
  '5373089606358829914',
  '5551285573735534526',
  '5601617820397479953',
  '5619197076673445305',
  '5636993642013585386',
  '5653405163391346524',
  '5733265870192340393',
  '5750857857521702048',
  '5801093619167758266',
  '5856862177039732761',
  '5895035234442609442',
  '6007450074425804757',
  '6040931683182241847',
  '6053994442524271290',
  '6120720785086600715',
  '6121999045266239512',
  '6123266115563208298',
  '6187570585196408391',
  '6204949958279902713',
  '6274150393220786282',
  '6340478179540421380',
  '6390180204961730098',
  '6499782689011360060',
  '6621267372274453578',
  '6778927819420580160',
  '6790655335448060761',
  '6807310515693256252',
  '6972192199015157538',
  '7089324972592191517',
  '7126832295732274413',
  '7142916197497260698',
  '7173437634713091595',
  '7202850208801621501',
  '7227543462677431084',
  '7298120283309667972',
  '7334246265956448693',
  '7427088550346847362',
  '7442403600685378258',
  '7544783833463163727',
  '7629972170328745230',
  '7652779422206303611',
  '7692790476226477797',
  '7732964067222153228',
  '7752629691716071603',
  '7756879238058715147',
  '7764647631774638086',
  '7888014318295946251',
  '7987848784811525631',
  '8011307699032145338',
  '8030229047815464416',
  '8059734604075550409',
  '8063788411765323217',
  '8131169131266438103',
  '8196028261319771823',
  '8222711381934529202',
  '8299463936212129947',
  '8336351586251566221',
  '8341972410644442671',
  '8442334156154085225',
  '8469940359374827838',
  '8496933084035243365',
  '8504858811813319673',
  '8595419946397110406',
  '8669087002421742251',
  '8688483628918916143',
  '8693536607862384419',
  '8717406029875112150',
  '8743774002532150844',
  '8825611082238414322',
  '8845273223124599021',
  '8884177014532859736',
  '8896254907195245301',
  '8900499823903382053',
  '8927180467223516682',
  '8972475683183093154',
  '9114526055944844525',
  '9166007738813311085',
  '9213152905643767781',
];

interface ParsedArgs {
  stage: string,
  profile: string | undefined,
  region: string,
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);

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
  const positional = args.filter((a, i) => !namedIndices.has(i));

  if (positional.length !== 1) {
    console.error('Usage: npx ts-node scripts/count-users-over-40min.ts <stage> [--profile <name>] [--region <region>]');
    process.exit(1);
  }

  return { stage: positional[0]!, profile, region };
}

async function queryAllByItem(
  client: DynamoDBDocumentClient, tableName: string, itemId: string,
): Promise<Array<{ groupId: string, total_time_spent: number }>> {
  const results: Array<{ groupId: string, total_time_spent: number }> = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  do {
    const output = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'itemId = :pk',
      ExpressionAttributeValues: { ':pk': itemId },
      ProjectionExpression: 'groupId, total_time_spent',
      ExclusiveStartKey: lastEvaluatedKey,
    }));
    for (const item of output.Items ?? []) {
      const time = typeof item.total_time_spent === 'number' ? item.total_time_spent : 0;
      if (time > 0) {
        results.push({ groupId: item.groupId as string, total_time_spent: time });
      }
    }
    lastEvaluatedKey = output.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);
  return results;
}

async function run(): Promise<void> {
  const { stage, profile, region } = parseArgs();
  const statsTable = `alg-sls-${stage}-user-task-stats`;

  console.log(`Table: ${statsTable}`);
  console.log(`Stage: ${stage}, Region: ${region}`);
  if (profile) {
    process.env.AWS_PROFILE = profile;
    console.log(`AWS Profile: ${profile}`);
  }
  console.log(`Items to query: ${ITEM_IDS.length}`);
  console.log(`Threshold: >${FORTY_MINUTES_MS}ms (40 min)`);
  console.log('---');

  const client = DynamoDBDocumentClient.from(new DynamoDB({ region }), {
    marshallOptions: { convertEmptyValues: true },
  });

  // groupId -> total time across all items (ms)
  const userTotals = new Map<string, number>();
  let itemsProcessed = 0;

  for (const itemId of ITEM_IDS) {
    const entries = await queryAllByItem(client, statsTable, itemId);
    for (const { groupId, total_time_spent } of entries) {
      userTotals.set(groupId, (userTotals.get(groupId) ?? 0) + total_time_spent);
    }
    itemsProcessed++;
    if (itemsProcessed % 20 === 0) {
      console.log(`Processed ${itemsProcessed}/${ITEM_IDS.length} items, ${userTotals.size} distinct users so far`);
    }
  }

  let countOver40 = 0;
  for (const [ , totalMs ] of userTotals) {
    if (totalMs > FORTY_MINUTES_MS) countOver40++;
  }

  console.log('---');
  console.log(`Total distinct users with any time: ${userTotals.size}`);
  console.log(`Distinct users with >40min total: ${countOver40}`);
}

run().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
