import { AuthenticationError } from '../utils/errors';

/**
 * The backend encodes a `date` field as dd-mm-yyyy and considers it valid
 * if it matches yesterday, today, or tomorrow (UTC).
 */
export function validateTokenDate(dateStr: string): void {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = new Date();
  const fmt = (d: Date): string => {
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };
  const valid = [
    fmt(new Date(now.getTime() - dayMs)),
    fmt(now),
    fmt(new Date(now.getTime() + dayMs)),
  ];
  if (!valid.includes(dateStr)) {
    throw new AuthenticationError('the token has expired (invalid date)');
  }
}
