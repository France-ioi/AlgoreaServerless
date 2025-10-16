import { Response } from 'lambda-api';

const createdResponse = { message: 'created', success: true };

export function created(resp: Response): typeof createdResponse {
  resp.status(201);
  return createdResponse;
}
