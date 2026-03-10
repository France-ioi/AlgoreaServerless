/* eslint-disable @typescript-eslint/naming-convention */
import { PutCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../dynamodb';

const getTableName = (): string => {
  const tableName = process.env.TABLE_NAME;
  if (!tableName) throw new Error('TABLE_NAME environment variable not set');
  return tableName;
};

const putItem = async (data: Record<string, unknown>): Promise<void> => {
  await docClient.send(new PutCommand({
    TableName: getTableName(),
    Item: data,
  }));
};

export const loadFixture = async (data: Record<string, unknown>[]): Promise<void> => {
  await Promise.all(data.map(putItem));
};

export const getAll = async (): Promise<Record<string, unknown>[]> => {
  const result = await docClient.send(new ScanCommand({ TableName: getTableName() }));
  return (result.Items ?? []) as Record<string, unknown>[];
};

export const deleteAll = async (): Promise<void> => {
  const items = await getAll();
  await Promise.all(items.map(item => {
    if (!item.pk || !item.sk) return;
    return docClient.send(new DeleteCommand({
      TableName: getTableName(),
      Key: { pk: item.pk, sk: item.sk },
    }));
  }));
};

export const clearTable = async (): Promise<void> => {
  await deleteAll();
};
