import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, deleteSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const cookie = req.headers.get('cookie') ?? '';
  const match = cookie.match(/session=([^;]+)/);
  if (match) deleteSession(decodeURIComponent(match[1]));
  const res = NextResponse.json({ ok: true });
  res.cookies.delete('session');
  return res;
}
