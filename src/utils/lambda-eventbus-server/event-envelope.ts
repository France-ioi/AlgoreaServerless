import { z } from 'zod';

/**
 * Common event envelope schema for all EventBridge events from the backend.
 * The payload is validated separately by each handler.
 */
export const eventEnvelopeSchema = z.object({
  version: z.string(),
  type: z.string(),
  source_app: z.string(),
  instance: z.string(),
  time: z.string(),
  request_id: z.string(),
  payload: z.unknown(),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

/**
 * Parses the version string and returns the major version number.
 * Expected format: "1.0", "2.1", etc.
 */
export function parseMajorVersion(version: string): number {
  const match = version.match(/^(\d+)\./);
  if (!match?.[1]) {
    return 0;
  }
  return parseInt(match[1], 10);
}
