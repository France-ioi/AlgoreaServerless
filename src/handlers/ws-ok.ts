import { APIGatewayProxyHandler } from 'aws-lambda';
import { wsOk } from '../utils/responses';

export const handler: APIGatewayProxyHandler = () => Promise.resolve(wsOk());