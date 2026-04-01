/* eslint-disable @typescript-eslint/naming-convention */
import { PutCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../dynamodb';

const getTableName = (): string => {
  const tableName = process.env.TABLE_NAME;
  if (!tableName) throw new Error('TABLE_NAME environment variable not set');
  return tableName;
};

const getNotificationsTableName = (): string => {
  const tableName = process.env.TABLE_NOTIFICATIONS;
  if (!tableName) throw new Error('TABLE_NOTIFICATIONS environment variable not set');
  return tableName;
};

const getConnectionsTableName = (): string => {
  const tableName = process.env.TABLE_CONNECTIONS;
  if (!tableName) throw new Error('TABLE_CONNECTIONS environment variable not set');
  return tableName;
};

const getStatsTableName = (): string => {
  const tableName = process.env.TABLE_STATS;
  if (!tableName) throw new Error('TABLE_STATS environment variable not set');
  return tableName;
};

const getActiveUsersTableName = (): string => {
  const tableName = process.env.TABLE_ACTIVE_USERS;
  if (!tableName) throw new Error('TABLE_ACTIVE_USERS environment variable not set');
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

export const getAllStats = async (): Promise<Record<string, unknown>[]> => {
  const result = await docClient.send(new ScanCommand({ TableName: getStatsTableName() }));
  return (result.Items ?? []) as Record<string, unknown>[];
};

export const getAllActiveUsers = async (): Promise<Record<string, unknown>[]> => {
  const result = await docClient.send(new ScanCommand({ TableName: getActiveUsersTableName() }));
  return (result.Items ?? []) as Record<string, unknown>[];
};

const clearTableByKeys = async (
  tableName: string,
  pkAttr: string,
  skAttr: string,
): Promise<void> => {
  const result = await docClient.send(new ScanCommand({ TableName: tableName }));
  const items = (result.Items ?? []) as Record<string, unknown>[];
  await Promise.all(items.map(item => {
    if (item[pkAttr] === undefined || item[skAttr] === undefined) return;
    return docClient.send(new DeleteCommand({
      TableName: tableName,
      Key: { [pkAttr]: item[pkAttr], [skAttr]: item[skAttr] },
    }));
  }));
};

const clearTableByPk = async (
  tableName: string,
  pkAttr: string,
): Promise<void> => {
  const result = await docClient.send(new ScanCommand({ TableName: tableName }));
  const items = (result.Items ?? []) as Record<string, unknown>[];
  await Promise.all(items.map(item => {
    if (item[pkAttr] === undefined) return;
    return docClient.send(new DeleteCommand({
      TableName: tableName,
      Key: { [pkAttr]: item[pkAttr] },
    }));
  }));
};

export const clearTable = async (): Promise<void> => {
  await Promise.all([
    clearTableByKeys(getTableName(), 'pk', 'sk'),
    clearTableByKeys(getNotificationsTableName(), 'userId', 'creationTime'),
    clearTableByPk(getConnectionsTableName(), 'connectionId'),
    clearTableByKeys(getStatsTableName(), 'pk', 'sk'),
    clearTableByPk(getActiveUsersTableName(), 'userId'),
  ]);
};
