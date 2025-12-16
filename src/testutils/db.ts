/* eslint-disable @typescript-eslint/naming-convention */
import { QueryCommandOutput } from '@aws-sdk/client-dynamodb';
import { dynamodb, toDBItem } from '../dynamodb';

const getTableName = (): string => {
  const tableName = process.env.TABLE_NAME;
  if (!tableName) throw new Error('TABLE_NAME environment variable not set');
  return tableName;
};

const putItem = async (data: Record<string, unknown>): Promise<void> => {
  await dynamodb.putItem({
    TableName: getTableName(),
    Item: toDBItem(data),
  });
};

export const loadFixture = async (data: Record<string, unknown>[]): Promise<void> => {
  await Promise.all(data.map(putItem));
};

export const getAll = (): Promise<QueryCommandOutput> => dynamodb.scan({ TableName: getTableName() });

export const deleteAll = async (): Promise<void> => {
  const result = await getAll();
  await Promise.all((result.Items || []).map(item => {
    if (!item.pk || !item.sk) return;
    return dynamodb.deleteItem({
      TableName: getTableName(),
      Key: { pk: item.pk, sk: item.sk },
    });
  }));
};

export const clearTable = async (): Promise<void> => {
  await deleteAll();
};
