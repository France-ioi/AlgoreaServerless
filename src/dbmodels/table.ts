/* eslint-disable @typescript-eslint/naming-convention */
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ExecuteStatementCommand, ExecuteTransactionCommand, BatchWriteCommand, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DBError } from '../utils/errors';
import { z } from 'zod';
import { safeNumber } from '../dynamodb';

export const tableKeySchema = z.object({
  pk: z.string(),
  sk: safeNumber,
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

  constructor(protected db: DynamoDBDocumentClient) {
    const tableName = process.env.TABLE_NAME;
    if (tableName === undefined || !tableName.length) throw new Error('env variable "TABLE_NAME" not set!');
    this.tableName = tableName;
  }

  protected async sqlWrite(statements: DBStatement[]|DBStatement): Promise<void> {
    try {
      if (Array.isArray(statements)) {
        await this.db.send(new ExecuteTransactionCommand({
          TransactStatements: statements.map(s => ({
            Statement: s.query,
            Parameters: s.params,
          })),
        }));
      } else {
        await this.db.send(new ExecuteStatementCommand({
          Statement: statements.query,
          Parameters: statements.params,
        }));
      }
    } catch (err) {
      if (err instanceof Error) throw new DBError(`[${err.name}] ${err.message}`, JSON.stringify(statements), { cause: err });
      else throw err;
    }
  }

  /**
   * Execute a PartiQL read query.
   *
   * IMPORTANT: Do NOT use `limit` when filtering by non-key attributes (anything other than pk/sk).
   * DynamoDB applies the limit BEFORE filtering, so it may return fewer results than expected
   * or empty results even when matching items exist.
   *
   * Known DynamoDB Local (used for testing) limitations:
   * - Does not support ORDER BY ... DESC (returns InternalFailure)
   * - Does not support LIMIT with non-key attribute filters (returns ValidationException)
   *
   * Workaround: Use the query() method directly instead of PartiQL for these cases.
   */
  protected async sqlRead(statement: DBStatement): Promise<Record<string, unknown>[]> {
    try {
      const output = await this.db.send(new ExecuteStatementCommand({
        Statement: statement.query,
        Parameters: statement.params,
        Limit: statement.limit,
      }));
      if (!output.Items) throw new DBError('(unexpected) no items in output', JSON.stringify(statement));
      return output.Items as Record<string, unknown>[];
    } catch (err) {
      if (err instanceof DBError) throw err;
      if (err instanceof Error) throw new DBError(`[${err.name}] ${err.message}`, JSON.stringify(statement), { cause: err });
      else throw err;
    }
  }

  protected async upsert(item: Record<string, unknown>): Promise<void> {
    try {
      await this.db.send(new PutCommand({
        TableName: this.tableName,
        Item: item,
      }));
    } catch (err) {
      if (err instanceof Error) throw new DBError(`[${err.name}] ${err.message}`, JSON.stringify(item), { cause: err });
      else throw err;
    }
  }

  protected async batchUpdate<T extends TableKey>(items: T[]): Promise<void> {
    const chunkSize = 25; // the max size of 'RequestItems' for the dynamoDB API
    for (let i = 0; i < items.length; i += chunkSize) {
      await this.db.send(new BatchWriteCommand({
        RequestItems: {
          [this.tableName]: items.slice(i, i + chunkSize).map(item => ({
            PutRequest: {
              Item: item,
            },
          })),
        },
      }));
    }
  }

  protected async countByPk(pk: string): Promise<number> {
    try {
      const output = await this.db.send(new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': pk },
        Select: 'COUNT',
      }));
      return output.Count ?? 0;
    } catch (err) {
      if (err instanceof Error) throw new DBError(`[${err.name}] ${err.message}`, pk, { cause: err });
      else throw err;
    }
  }

  protected async query(params: {
    pk: string,
    filter?: { attribute: string, value: unknown },
    projectionAttributes?: string[],
    limit?: number,
    scanIndexForward?: boolean,
  }): Promise<Record<string, unknown>[]> {
    try {
      const queryParams: {
        TableName: string,
        KeyConditionExpression: string,
        ExpressionAttributeValues: Record<string, unknown>,
        ExpressionAttributeNames?: Record<string, string>,
        FilterExpression?: string,
        ProjectionExpression?: string,
        Limit?: number,
        ScanIndexForward?: boolean,
      } = {
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': params.pk },
        ScanIndexForward: params.scanIndexForward ?? true,
      };

      if (params.filter) {
        queryParams.FilterExpression = `${params.filter.attribute} = :filterValue`;
        queryParams.ExpressionAttributeValues[':filterValue'] = params.filter.value;
      }

      if (params.projectionAttributes) {
        const expressionAttributeNames: Record<string, string> = {};
        queryParams.ProjectionExpression = params.projectionAttributes.map(attr => {
          const reservedWords = [ 'data', 'name', 'type', 'status', 'timestamp' ];
          if (reservedWords.includes(attr.toLowerCase())) {
            expressionAttributeNames[`#${attr}`] = attr;
            return `#${attr}`;
          }
          return attr;
        }).join(', ');
        if (Object.keys(expressionAttributeNames).length > 0) {
          queryParams.ExpressionAttributeNames = expressionAttributeNames;
        }
      }

      if (params.limit) {
        queryParams.Limit = params.limit;
      }

      const output = await this.db.send(new QueryCommand(queryParams));

      if (!output.Items) return [];
      return output.Items as Record<string, unknown>[];
    } catch (err) {
      if (err instanceof Error) throw new DBError(`[${err.name}] ${err.message}`, JSON.stringify(params), { cause: err });
      else throw err;
    }
  }
}
