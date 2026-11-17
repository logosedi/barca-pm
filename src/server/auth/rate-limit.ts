// Fixed-window limiter kept in memory. It protects the login form from password
// guessing on a single server; with several instances it would need a shared store
// (see docs/ROADMAP.md).

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const attempts = new Map<string, { count: number; resetAt: number }>();

/** Registers an attempt and tells whether it is still within the limit. */
export function allowAttempt(key: string, now = Date.now()) {
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    if (attempts.size > 10_000) for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= MAX_ATTEMPTS;
}

export function clearAttempts(key: string) {
  attempts.delete(key);
}
