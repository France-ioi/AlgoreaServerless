import type { ALBResult, APIGatewayProxyResult } from 'aws-lambda';

export const wsOk = (message = ''): APIGatewayProxyResult => ({ statusCode: 200, body: message });
export const wsBadRequest = (message = ''): APIGatewayProxyResult => ({ statusCode: 400, body: message });
export const wsUnauthorized = (message = ''): APIGatewayProxyResult => ({ statusCode: 401, body: message });
export const wsForbidden = (message = ''): APIGatewayProxyResult => ({ statusCode: 403, body: message });
export const wsNotFound = (message = ''): APIGatewayProxyResult => ({ statusCode: 404, body: message });
export const wsServerError = (message = 'Internal server error'): APIGatewayProxyResult => ({ statusCode: 500, body: message });

// eslint-disable-next-line @typescript-eslint/naming-convention
const headers = { 'Content-Type': 'application/json' };
export const success = (data: unknown): ALBResult => ({ statusCode: 200, body: JSON.stringify(data), headers });
export const created = (): ALBResult => ({ statusCode: 201, body: JSON.stringify({ success: true, message: 'created' }), headers });
