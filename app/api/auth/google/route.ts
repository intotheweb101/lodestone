import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

export function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL('/login?error=google_not_configured', req.url));
  }
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? new URL('/api/auth/google/callback', req.url).toString();

  // Generate and store a CSRF state token in a short-lived cookie
  const state = randomBytes(16).toString('hex');

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('state', state);

  const res = NextResponse.redirect(url.toString());
  res.cookies.set('oauth_state', state, {
    httpOnly: true, path: '/', maxAge: 600, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
