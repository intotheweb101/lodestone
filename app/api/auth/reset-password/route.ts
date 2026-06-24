/**
 * POST /api/auth/reset-password
 * Consumes a password-reset token and sets a new password.
 */

import { NextRequest, NextResponse } from 'next/server';
import { consumePasswordResetToken, setUserPassword } from '@/lib/auth/index';
import { runMigrations } from '@/lib/db/migrations';
import { checkRateLimit, getClientIp } from '@/lib/auth/rate-limit';

runMigrations();

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit('reset:' + ip)) {
    return NextResponse.json({ error: 'Too many attempts. Please wait before trying again.' }, { status: 429 });
  }
  let token = '', newPassword = '';
  try {
    const body = await req.json() as { token?: string; password?: string };
    token = body.token ?? '';
    newPassword = body.password ?? '';
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  if (!newPassword) return NextResponse.json({ error: 'Missing password' }, { status: 400 });
  if (newPassword.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  const userId = consumePasswordResetToken(token);
  if (!userId) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired. Please request a new one.' }, { status: 400 });
  }

  try {
    await setUserPassword(userId, newPassword);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to set password' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
