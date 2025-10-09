import type { APIGatewayProxyResult } from 'aws-lambda';

export const wsOk = (message = ''): APIGatewayProxyResult => ({ statusCode: 200, body: message });
export const wsBadRequest = (message = ''): APIGatewayProxyResult => ({ statusCode: 400, body: message });
export const wsUnauthorized = (message = ''): APIGatewayProxyResult => ({ statusCode: 401, body: message });
export const wsForbidden = (message = ''): APIGatewayProxyResult => ({ statusCode: 403, body: message });
export const wsNotFound = (message = ''): APIGatewayProxyResult => ({ statusCode: 404, body: message });
export const wsServerError = (message = 'Internal server error'): APIGatewayProxyResult => ({ statusCode: 500, body: message });
