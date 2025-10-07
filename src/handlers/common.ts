import type { ALBEvent } from 'aws-lambda';

export type ReqBody = ALBEvent['body'];
export type ReqQueryParams = ALBEvent['queryStringParameters'];
