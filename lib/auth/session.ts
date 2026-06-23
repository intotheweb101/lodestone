/**
 * Session helpers that use next/headers (async cookies).
 *
 * Kept separate from lib/auth/index.ts so that scripts and schedulers can
 * import auth primitives without pulling in the next/headers request-time API.
 */

import { cookies } from 'next/headers';
import { getSessionUser, getUserById } from './index';
import type { User } from './index';

export type { User };

/** The 'local' sentinel user — represents an unauthenticated local dev session. */
export const LOCAL_USER_ID = 'local';

let _localUser: User | null = null;
function getLocalUser(): User {
  if (!_localUser) {
    _localUser = getUserById(LOCAL_USER_ID) ?? {
      id: LOCAL_USER_ID,
      email: 'local@localhost',
      name: 'Local User',
      role: 'user',
      avatar_url: null,
      created_at: new Date().toISOString(),
      username: 'local',
    };
  }
  return _localUser;
}

/** Returns the currently authenticated user, or null if no valid session. */
export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;
  if (!token) return null;
  return getSessionUser(decodeURIComponent(token));
}

/**
 * Returns the current user, throwing a 401 error if not authenticated.
 * Use in server actions / route handlers that require a real account.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw Object.assign(new Error('Not authenticated'), { status: 401 });
  return user;
}

/**
 * Returns the current authenticated user, or the 'local' sentinel user for
 * unauthenticated local dev. Gated by the ALLOW_LOCAL_FALLBACK env flag (set
 * in dev; in production anonymous users get null from getCurrentUser instead).
 *
 * Most deck actions use this so local dev keeps working without a login.
 */
export async function resolveActingUser(): Promise<User> {
  const user = await getCurrentUser();
  if (user) return user;
  if (process.env.ALLOW_LOCAL_FALLBACK !== 'false') return getLocalUser();
  throw Object.assign(new Error('Not authenticated'), { status: 401 });
}
