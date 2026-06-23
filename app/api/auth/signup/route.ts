import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { hashPassword, createUser, getUserByEmail, createSession } from '@/lib/auth';
import { runMigrations } from '@/lib/db/migrations';
import { getDb } from '@/lib/db/connection';

export async function POST(req: NextRequest) {
  runMigrations();
  const { email, name, password } = await req.json() as { email: string; name: string; password: string };
  if (!email || !name || !password) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  if (getUserByEmail(email)) return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  const db = getDb();
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  const role = userCount === 0 ? 'admin' : 'user';
  const passwordHash = await hashPassword(password);
  const user = createUser({ id: randomBytes(16).toString('hex'), email, name, password_hash: passwordHash, role });
  const token = createSession(user.id);
  const res = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  res.cookies.set('session', token, { httpOnly: true, path: '/', maxAge: 30 * 86400, sameSite: 'lax' });
  return res;
}
