/**
 * Simple per-IP rate limiter backed by SQLite.
 * No external dependency. Used for auth endpoints (login, signup).
 */

import { getDb } from '../db/connection';

const WINDOW_SECONDS = 15 * 60; // 15-minute window
const MAX_ATTEMPTS = 10;          // 10 attempts per window

/** Returns the client IP from standard headers. Falls back to 'unknown'. */
export function getClientIp(req: Request): string {
  const h = req.headers as Headers;
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    'unknown'
  );
}

/**
 * Check and record an attempt for the given key (e.g. `login:1.2.3.4`).
 * Returns `{ limited: true }` if the limit is exceeded, otherwise `{ limited: false }`.
 * @param maxAttempts Override the default limit (defaults to MAX_ATTEMPTS = 10).
 */
export function checkRateLimit(key: string, maxAttempts = MAX_ATTEMPTS): { limited: boolean; remaining: number } {
  const db = getDb();

  // Ensure table exists (idempotent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_rate_limit (
      key        TEXT NOT NULL,
      attempts   INTEGER NOT NULL DEFAULT 1,
      window_end TEXT NOT NULL,
      PRIMARY KEY (key)
    )
  `);

  const now = new Date();
  const windowEnd = new Date(now.getTime() + WINDOW_SECONDS * 1000).toISOString();

  // Clean expired entries opportunistically
  db.prepare(`DELETE FROM auth_rate_limit WHERE window_end < ?`).run(now.toISOString());

  const row = db.prepare(`SELECT attempts, window_end FROM auth_rate_limit WHERE key = ?`).get(key) as
    { attempts: number; window_end: string } | undefined;

  if (!row) {
    db.prepare(`INSERT INTO auth_rate_limit (key, attempts, window_end) VALUES (?, 1, ?)`).run(key, windowEnd);
    return { limited: false, remaining: maxAttempts - 1 };
  }

  if (row.attempts >= maxAttempts) {
    return { limited: true, remaining: 0 };
  }

  db.prepare(`UPDATE auth_rate_limit SET attempts = attempts + 1 WHERE key = ?`).run(key);
  return { limited: false, remaining: maxAttempts - row.attempts - 1 };
}
