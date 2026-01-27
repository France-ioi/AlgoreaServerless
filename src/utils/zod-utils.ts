import { ZodType } from 'zod';

/**
 * Safely parses an array of items, filtering out those that don't match the schema.
 * Logs a warning for each item that fails parsing.
 *
 * @param items - The array of unknown items to parse
 * @param schema - The Zod schema for a single item
 * @param context - A descriptive context string for logging (e.g., "thread subscription")
 * @returns An array of successfully parsed items
 */
export function safeParseArray<T>(
  items: unknown[],
  schema: ZodType<T>,
  context: string
): T[] {
  const validItems: T[] = [];

  for (const item of items) {
    const result = schema.safeParse(item);
    if (result.success) {
      validItems.push(result.data);
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        `Failed to parse ${context}:`,
        result.error.message,
        'Item:',
        JSON.stringify(item)
      );
    }
  }

  return validItems;
}
