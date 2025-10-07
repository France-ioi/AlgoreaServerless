/* eslint-disable @typescript-eslint/no-floating-promises */
import { ALBHandler, ALBEvent, Context, Callback } from 'aws-lambda';

const corsHeaders = {
  /* eslint-disable @typescript-eslint/naming-convention */
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  /* eslint-enable @typescript-eslint/naming-convention */
};


export function withCors(next: ALBHandler): ALBHandler {

  return async (event: ALBEvent, context: Context, callback: Callback) => {
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: corsHeaders,
      };
    }
    const response = await next(event, context, callback);
    return {
      statusCode: 200,
      ...response,
      headers: {
        ...response?.headers,
        ...corsHeaders,
      },
    };
  };
}
