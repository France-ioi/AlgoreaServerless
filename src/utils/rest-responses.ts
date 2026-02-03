import { Response } from 'lambda-api';

const createdResponse = { message: 'created', success: true };
const deletedResponse = { message: 'deleted', success: true };

/**
 * Standard response for POST requests that create a resource.
 * Sets status to 201 Created.
 */
export function created(resp: Response): typeof createdResponse {
  resp.status(201);
  return createdResponse;
}

/**
 * Standard response for DELETE requests.
 * Sets status to 200 OK.
 */
export function deleted(resp: Response): typeof deletedResponse {
  resp.status(200);
  return deletedResponse;
}
