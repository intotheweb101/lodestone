/**
 * POST /api/auth/forgot-password
 * Sends a password-reset link to the email address.
 * Always returns 200 to prevent account enumeration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, createPasswordResetToken } from '@/lib/auth/index';
import { checkRateLimit, getClientIp } from '@/lib/auth/rate-limit';
import { sendPasswordResetEmail } from '@/lib/email/send';
import { runMigrations } from '@/lib/db/migrations';

runMigrations();

const APP_URL = (process.env.APP_URL ?? '').replace(/\/$/, '');

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { limited } = checkRateLimit(`forgot:${ip}`);
  if (limited) {
    // Still 200 — don't leak that this is rate-limited
    return NextResponse.json({ ok: true });
  }

  let email = '';
  try {
    const body = await req.json() as { email?: string };
    email = (body.email ?? '').toLowerCase().trim();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (!email) return NextResponse.json({ ok: true }); // always 200

  const user = getUserByEmail(email);
  if (!user || !user.password_hash) {
    // No account or Google-only — silently succeed
    return NextResponse.json({ ok: true });
  }

  const rawToken = createPasswordResetToken(user.id);
  const resetUrl = `${APP_URL}/reset-password?token=${rawToken}`;

  try {
    await sendPasswordResetEmail(email, resetUrl);
  } catch (err) {
    console.error('[forgot-password] email send failed:', err);
    // Still return 200 — the console fallback always logs the link
  }

  return NextResponse.json({ ok: true });
}
