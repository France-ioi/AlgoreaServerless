import { GoneException } from '@aws-sdk/client-apigatewaymanagementapi';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';

export function logError(err: unknown): void {
  // eslint-disable-next-line no-console
  if (err instanceof OperationSkipped) console.warn(errorToString(err));
  // eslint-disable-next-line no-console
  else console.error(errorToString(err));
}

export function errorToString(err: unknown): string {
  if (err instanceof TransactionCanceledException) {
    return `${err.name}: ${err.message} - CancellationReasons: ${JSON.stringify(err.CancellationReasons)}`;
  }
  if (err instanceof DBError) {
    return `${err.name}: ${err.message} - Statement(s): ${err.details}`;
  }
  if (err instanceof GoneException) {
    return 'Connection closed';
  }
  if (err instanceof Error || err instanceof Forbidden || err instanceof ServerError ||
    err instanceof DecodingError || err instanceof AuthenticationError || err instanceof OperationSkipped) {
    return `${err.name}: ${err.message}`;
  }
  return `An unexpected error occured (${JSON.stringify(err)})`;
}

export class DBError extends Error {
  details: string;
  constructor(message: string /* error description */, details: string /* statement details */) {
    super(message);
    this.name = 'DBError';
    this.details = details;
  }
}

export class DecodingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecodingError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class RouteNotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RouteNotFound';
  }
}

export class Forbidden extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Forbidden';
  }
}

export class OperationSkipped extends Error { /* this is not an actual error, it has to be consired as a warning */
  constructor(message: string) {
    super(message);
    this.name = 'OperationSkipped';
  }
}

export class ServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServerError';
  }
}
