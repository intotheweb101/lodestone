import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, verifyPassword, createSession } from '@/lib/auth';
import { runMigrations } from '@/lib/db/migrations';

export async function POST(req: NextRequest) {
  runMigrations();
  const { email, password } = await req.json() as { email: string; password: string };
  if (!email || !password) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  const user = getUserByEmail(email);
  if (!user || !user.password_hash) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  const token = createSession(user.id);
  const res = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
  res.cookies.set('session', token, { httpOnly: true, path: '/', maxAge: 30 * 86400, sameSite: 'lax' });
  return res;
}
