import { AttributeValue, DynamoDB, ExecuteStatementCommandOutput, QueryCommandOutput } from '@aws-sdk/client-dynamodb';
import { fromDBItem, toDBItem, toDBParameters } from '../dynamodb';
import { DBError } from '../utils/errors';
import { z } from 'zod';

export const tableKeySchema = z.object({
  pk: z.string(),
  sk: z.number(),
});

export type TableKey = z.infer<typeof tableKeySchema>;

export interface DBStatement {
  query: string,
  params: unknown[],
  limit?: number,
}

/**
 * WebSocket connection TTL in seconds.
 * Constrained by the connection duration limit for WebSocket API on API Gateway, which is 2 hours.
 * @see https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html
 */
export const WS_CONNECTION_TTL_SECONDS = 7_200; // 2 hours

/**
 * Calculates the TTL value for a database entry in seconds since epoch.
 * Used for entries that should expire when the WebSocket connection times out.
 */
export function wsConnectionTtl(): number {
  return Math.floor(Date.now() / 1000) + WS_CONNECTION_TTL_SECONDS;
}

export class Table {
  protected tableName: string;

  constructor(protected db: DynamoDB) {
    const tableName = process.env.TABLE_NAME;
    if (tableName === undefined || !tableName.length) throw new Error('env variable "TABLE_NAME" not set!');
    this.tableName = tableName;
  }

  protected async sqlWrite(statements: DBStatement[]|DBStatement): Promise<void> {
    try {
      /* eslint-disable @typescript-eslint/naming-convention */
      if (Array.isArray(statements)) {
        await this.db.executeTransaction({
          TransactStatements: statements.map(s => ({
            Statement: s.query,
            Parameters: toDBParameters(s.params),
          })),
        });
      } else await this.db.executeStatement({ Statement: statements.query, Parameters: toDBParameters(statements.params) });
      /* eslint-enable @typescript-eslint/naming-convention */
    } catch (err) {
      if (err instanceof Error) throw new DBError(`[${err.name}] ${err.message}`, JSON.stringify(statements));
      else throw err;
    }
  }

  /**
   * Execute a PartiQL read query.
   *
   * Known DynamoDB Local (used for testing) limitations:
   * - Does not support ORDER BY ... DESC (returns InternalFailure)
   * - Does not support LIMIT with non-key attribute filters (returns ValidationException)
   *
   * Workaround: Use the query() method directly instead of PartiQL for these cases.
   */
  protected async sqlRead(statement: DBStatement): Promise<Record<string, unknown>[]> {
    let output: ExecuteStatementCommandOutput;
    try {
      /* eslint-disable @typescript-eslint/naming-convention */
      output = await this.db.executeStatement({
        Statement: statement.query,
        Parameters: toDBParameters(statement.params),
        Limit: statement.limit
      });
      /* eslint-enable @typescript-eslint/naming-convention */
    } catch (err) {
      if (err instanceof Error) throw new DBError(`[${err.name}] ${err.message}`, JSON.stringify(statement));
      else throw err;
    }
    if (!output.Items) throw new DBError('(unexpected) no items in output', JSON.stringify(statement));
    return output.Items.map(fromDBItem);
  }

  protected async batchUpdate<T extends TableKey>(items: T[]): Promise<void> {
    const chunkSize = 25; // the max size of 'RequestItems' for the dynamoDB APi
    for (let i = 0; i < items.length; i += chunkSize) {
      await this.db.batchWriteItem({
        /* eslint-disable @typescript-eslint/naming-convention */
        RequestItems: {
          [this.tableName]: items.slice(i, i + chunkSize).map(i => ({
            PutRequest: {
              Item: toDBItem(i),
            },
          })),
        }
        /* eslint-enable @typescript-eslint/naming-convention */
      });
    }

  }

  protected async query(params: {
    pk: string,
    filter?: { attribute: string, value: unknown },
    projectionAttributes?: string[],
    limit?: number,
    scanIndexForward?: boolean,
  }): Promise<Record<string, unknown>[]> {
    let output: QueryCommandOutput;
    try {
      /* eslint-disable @typescript-eslint/naming-convention */
      const queryParams: {
        TableName: string,
        KeyConditionExpression: string,
        ExpressionAttributeValues: Record<string, AttributeValue>,
        ExpressionAttributeNames?: Record<string, string>,
        FilterExpression?: string,
        ProjectionExpression?: string,
        Limit?: number,
        ScanIndexForward?: boolean,
      } = {
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: toDBItem({ ':pk': params.pk }),
        ScanIndexForward: params.scanIndexForward ?? true,
      };

      if (params.filter) {
        queryParams.FilterExpression = `${params.filter.attribute} = :filterValue`;
        queryParams.ExpressionAttributeValues = {
          ...queryParams.ExpressionAttributeValues,
          ...toDBItem({ ':filterValue': params.filter.value }),
        } as Record<string, AttributeValue>;
      }

      if (params.projectionAttributes) {
        // Handle reserved words like "data" by using ExpressionAttributeNames
        const expressionAttributeNames: Record<string, string> = {};
        queryParams.ProjectionExpression = params.projectionAttributes.map(attr => {
          // Reserved words in DynamoDB need to be aliased
          const reservedWords = [ 'data', 'name', 'type', 'status', 'timestamp' ];
          if (reservedWords.includes(attr.toLowerCase())) {
            expressionAttributeNames[`#${attr}`] = attr;
            return `#${attr}`;
          }
          return attr;
        }).join(', ');
        // Only set ExpressionAttributeNames if it's not empty (DynamoDB rejects empty objects)
        if (Object.keys(expressionAttributeNames).length > 0) {
          queryParams.ExpressionAttributeNames = expressionAttributeNames;
        }
      }

      if (params.limit) {
        queryParams.Limit = params.limit;
      }

      output = await this.db.query(queryParams);
      /* eslint-enable @typescript-eslint/naming-convention */
    } catch (err) {
      if (err instanceof Error) throw new DBError(`[${err.name}] ${err.message}`, JSON.stringify(params));
      else throw err;
    }

    if (!output.Items) return [];
    return output.Items.map(fromDBItem);
  }

}
