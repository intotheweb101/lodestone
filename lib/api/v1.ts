/**
 * Shared helpers for the /api/v1 read API.
 * - Response/error wrappers with consistent shape { data, meta } / { error, status }
 * - Optional API key auth: anonymous requests are allowed at a base rate limit;
 *   a valid Bearer key raises the limit and logs last_used_at.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getDb } from '@/lib/db/connection';
import { checkRateLimit, getClientIp } from '@/lib/auth/rate-limit';

const ANON_RATE_KEY_PREFIX = 'apiv1:anon:';
const KEY_RATE_KEY_PREFIX = 'apiv1:key:';

/**
 * Check rate limit and resolve optional API key.
 * Returns { ok: false, response } on limit/invalid key, or { ok: true, keyId? } on pass.
 */
export async function checkApiAuth(req: NextRequest): Promise<
  | { ok: false; response: NextResponse }
  | { ok: true; keyId?: string }
> {
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const rawKey = authHeader.slice(7).trim();
    const hash = createHash('sha256').update(rawKey).digest('hex');
    const db = getDb();
    const row = db.prepare(
      `SELECT id, user_id FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL`
    ).get(hash) as { id: string; user_id: string } | undefined;
    if (!row) {
      return { ok: false, response: apiError('Invalid or revoked API key', 401) };
    }
    // Keyed requests: generous 300/15min limit
    const rl = checkRateLimit(KEY_RATE_KEY_PREFIX + row.id, 300);
    if (rl.limited) {
      return { ok: false, response: apiError('Rate limit exceeded', 429) };
    }
    // Update last_used_at (best-effort, fire-and-forget)
    db.prepare(`UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`).run(row.id);
    return { ok: true, keyId: row.id };
  }

  // Anonymous: 60/15min limit by IP
  const ip = getClientIp(req);
  const rl = checkRateLimit(ANON_RATE_KEY_PREFIX + ip, 60);
  if (rl.limited) {
    return { ok: false, response: apiError('Rate limit exceeded. Use an API key for higher limits.', 429) };
  }
  return { ok: true };
}

export function apiOk<T>(data: T, meta?: Record<string, unknown>): NextResponse {
  return NextResponse.json({
    data,
    meta: { version: 1, ...meta },
  });
}

export function apiError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message, status }, { status });
}
