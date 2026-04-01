/* eslint-disable @typescript-eslint/naming-convention */
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  ExecuteStatementCommand, ExecuteTransactionCommand, BatchWriteCommand,
  QueryCommand, PutCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
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
  protected readonly pkAttribute: string = 'pk';
  protected readonly skAttribute: string = 'sk';

  constructor(protected db: DynamoDBDocumentClient, tableEnvVar = 'TABLE_NAME') {
    const tableName = process.env[tableEnvVar];
    if (!tableName?.length) throw new Error(`env variable "${tableEnvVar}" not set!`);
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

  protected async incrementCounter(key: TableKey, options?: { ttl?: number }): Promise<void> {
    try {
      const expressionNames: Record<string, string> = { '#count': 'count' };
      const expressionValues: Record<string, unknown> = { ':increment': 1 };
      let updateExpression = 'ADD #count :increment';
      if (options?.ttl !== undefined) {
        expressionNames['#ttl'] = 'ttl';
        expressionValues[':ttl'] = options.ttl;
        updateExpression += ' SET #ttl = :ttl';
      }
      await this.db.send(new UpdateCommand({
        TableName: this.tableName,
        Key: key,
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues,
      }));
    } catch (err) {
      if (err instanceof Error) throw new DBError(`[${err.name}] ${err.message}`, JSON.stringify(key), { cause: err });
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

  protected async countByPk(pk: string, options?: {
    skRange?: { start?: number, end?: number },
    excludeExpiredTtl?: boolean,
  }): Promise<number> {
    try {
      const expressionValues: Record<string, unknown> = { ':pk': pk };
      let keyCondition = `${this.pkAttribute} = :pk`;
      let filterExpression: string | undefined;
      let expressionNames: Record<string, string> | undefined;

      if (options?.skRange?.start !== undefined && options.skRange.end !== undefined) {
        keyCondition += ` AND ${this.skAttribute} BETWEEN :skStart AND :skEnd`;
        expressionValues[':skStart'] = options.skRange.start;
        expressionValues[':skEnd'] = options.skRange.end;
      } else if (options?.skRange?.start !== undefined) {
        keyCondition += ` AND ${this.skAttribute} >= :skStart`;
        expressionValues[':skStart'] = options.skRange.start;
      } else if (options?.skRange?.end !== undefined) {
        keyCondition += ` AND ${this.skAttribute} <= :skEnd`;
        expressionValues[':skEnd'] = options.skRange.end;
      }

      if (options?.excludeExpiredTtl) {
        expressionValues[':now'] = Math.floor(Date.now() / 1000);
        expressionNames = { '#ttl': 'ttl' };
        filterExpression = '#ttl > :now';
      }

      let total = 0;
      let lastEvaluatedKey: Record<string, unknown> | undefined;

      do {
        const output = await this.db.send(new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: keyCondition,
          ExpressionAttributeValues: expressionValues,
          ExpressionAttributeNames: expressionNames,
          FilterExpression: filterExpression,
          Select: 'COUNT',
          ExclusiveStartKey: lastEvaluatedKey,
        }));
        total += output.Count ?? 0;
        lastEvaluatedKey = output.LastEvaluatedKey as Record<string, unknown> | undefined;
      } while (lastEvaluatedKey);

      return total;
    } catch (err) {
      if (err instanceof Error) throw new DBError(`[${err.name}] ${err.message}`, pk, { cause: err });
      else throw err;
    }
  }

  protected async query(params: {
    pk: string,
    skRange?: { start?: number, end?: number },
    filter?: { attribute: string, value: unknown },
    projectionAttributes?: string[],
    limit?: number,
    scanIndexForward?: boolean,
    index?: { name: string, pkAttribute: string, skAttribute: string },
  }): Promise<Record<string, unknown>[]> {
    try {
      const pkAttr = params.index?.pkAttribute ?? this.pkAttribute;
      const skAttr = params.index?.skAttribute ?? this.skAttribute;
      const expressionValues: Record<string, unknown> = { ':pk': params.pk };
      let keyCondition = `${pkAttr} = :pk`;

      if (params.skRange?.start !== undefined && params.skRange?.end !== undefined) {
        keyCondition += ` AND ${skAttr} BETWEEN :skStart AND :skEnd`;
        expressionValues[':skStart'] = params.skRange.start;
        expressionValues[':skEnd'] = params.skRange.end;
      } else if (params.skRange?.start !== undefined) {
        keyCondition += ` AND ${skAttr} >= :skStart`;
        expressionValues[':skStart'] = params.skRange.start;
      } else if (params.skRange?.end !== undefined) {
        keyCondition += ` AND ${skAttr} <= :skEnd`;
        expressionValues[':skEnd'] = params.skRange.end;
      }

      const expressionNames: Record<string, string> = {};
      let filterExpression: string | undefined;

      if (params.filter) {
        filterExpression = `${params.filter.attribute} = :filterValue`;
        expressionValues[':filterValue'] = params.filter.value;
      }

      let projectionExpression: string | undefined;
      if (params.projectionAttributes) {
        projectionExpression = params.projectionAttributes.map(attr => {
          const reservedWords = [ 'data', 'name', 'type', 'status', 'timestamp', 'count' ];
          if (reservedWords.includes(attr.toLowerCase())) {
            expressionNames[`#${attr}`] = attr;
            return `#${attr}`;
          }
          return attr;
        }).join(', ');
      }

      const results: Record<string, unknown>[] = [];
      let lastEvaluatedKey: Record<string, unknown> | undefined;

      do {
        const output = await this.db.send(new QueryCommand({
          TableName: this.tableName,
          IndexName: params.index?.name,
          KeyConditionExpression: keyCondition,
          ExpressionAttributeValues: expressionValues,
          ExpressionAttributeNames: Object.keys(expressionNames).length > 0 ? expressionNames : undefined,
          FilterExpression: filterExpression,
          ProjectionExpression: projectionExpression,
          Limit: params.limit,
          ScanIndexForward: params.scanIndexForward ?? true,
          ExclusiveStartKey: lastEvaluatedKey,
        }));

        results.push(...(output.Items ?? []) as Record<string, unknown>[]);
        lastEvaluatedKey = output.LastEvaluatedKey as Record<string, unknown> | undefined;
      } while (lastEvaluatedKey && (!params.limit || results.length < params.limit));

      return params.limit ? results.slice(0, params.limit) : results;
    } catch (err) {
      if (err instanceof Error) throw new DBError(`[${err.name}] ${err.message}`, JSON.stringify(params), { cause: err });
      else throw err;
    }
  }
}
