import { NextRequest, NextResponse } from 'next/server';
import { upsertGoogleUser, createSession } from '@/lib/auth';
import { runMigrations } from '@/lib/db/migrations';

export async function GET(req: NextRequest) {
  runMigrations();
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/login?error=no_code', req.url));
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? new URL('/api/auth/google/callback', req.url).toString();
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    const tokens = await tokenRes.json() as { access_token: string };
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + tokens.access_token },
    });
    const info = await infoRes.json() as { sub: string; email: string; name: string; picture?: string };
    const user = upsertGoogleUser({ google_id: info.sub, email: info.email, name: info.name, avatar_url: info.picture });
    const token = createSession(user.id);
    const res = NextResponse.redirect(new URL('/', req.url));
    res.cookies.set('session', token, { httpOnly: true, path: '/', maxAge: 30 * 86400, sameSite: 'lax' });
    return res;
  } catch {
    return NextResponse.redirect(new URL('/login?error=google_failed', req.url));
  }
}
