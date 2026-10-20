/**
 * src/lib/strivy/ratelimit.ts
 *
 * A small in-memory limiter for STRIVY's user routes: a fixed number of
 * requests per user per rolling window. It lives in the server instance's
 * memory, so on serverless hosting it is a per-instance safety net against a
 * stuck client or a script, not a global quota. No data is stored beyond a
 * user id and a few timestamps, and old entries are dropped as they expire.
 */
export interface RateLimiter {
  /** true when this request is allowed (and counts it). */
  take(key: string, now?: number): boolean;
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();
  let lastSweep = 0;
  return {
    take(key, now = Date.now()) {
      if (now - lastSweep > windowMs) {
        for (const [k, times] of hits) {
          if (times.every((t) => now - t >= windowMs)) hits.delete(k);
        }
        lastSweep = now;
      }
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
  };
}

/** 20 messages a minute is far above normal chatting. */
export const chatLimiter = createRateLimiter(20, 60_000);
