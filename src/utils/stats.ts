export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [ ...values ].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function countAtOrBelow(sortedValues: number[], threshold: number): number {
  let lo = 0;
  let hi = sortedValues.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedValues[mid]! <= threshold) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
