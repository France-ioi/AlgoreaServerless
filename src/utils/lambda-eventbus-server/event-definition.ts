import { z } from 'zod';

export interface EventDefinition<T> {
  detailType: string,
  schema: z.ZodType<T>,
}

export function defineEvent<T>(detailType: string, schema: z.ZodType<T>): EventDefinition<T> {
  return { detailType, schema };
}
