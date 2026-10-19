/** Exponential backoff 1s → 60s cap, with "equal jitter" (half fixed, half random). */
export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(60_000, 1_000 * 2 ** Math.max(0, attempts - 1));
  return Math.round(base / 2 + random() * (base / 2));
}
