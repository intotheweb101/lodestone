import { createHash, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { getDb } from '@/lib/db/connection';

const db = getDb();

const scryptAsync = promisify(scrypt);

// ─── Passwords ───────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return buf.toString('hex') + '.' + salt;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split('.');
  const hashedBuf = Buffer.from(hashed, 'hex');
  const suppliedBuf = (await scryptAsync(password, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

// ─── Users ───────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar_url: string | null;
  created_at: string;
  username: string | null;
}

export function getUserByEmail(email: string): (User & { password_hash: string | null }) | null {
  return db.prepare('SELECT id, email, name, role, avatar_url, created_at, password_hash FROM users WHERE email = ?').get(email) as (User & { password_hash: string | null }) | null;
}

export function getUserByGoogleId(googleId: string): User | null {
  return db.prepare('SELECT id, email, name, role, avatar_url, created_at FROM users WHERE google_id = ?').get(googleId) as User | null;
}

export function getUserById(id: string): User | null {
  return db.prepare('SELECT id, email, name, role, avatar_url, created_at FROM users WHERE id = ?').get(id) as User | null;
}

export function getUserByUsername(username: string): (User & { username: string | null; bio: string | null }) | null {
  return db.prepare('SELECT id, email, name, role, avatar_url, created_at, username, bio FROM users WHERE username = ?').get(username) as (User & { username: string | null; bio: string | null }) | null;
}

export function createUser(opts: { id: string; email: string; name: string; password_hash?: string; google_id?: string; avatar_url?: string; role?: string }): User {
  db.prepare(`
    INSERT INTO users (id, email, name, password_hash, google_id, avatar_url, role)
    VALUES (@id, @email, @name, @password_hash, @google_id, @avatar_url, @role)
  `).run({ password_hash: null, google_id: null, avatar_url: null, role: 'user', ...opts });
  return getUserById(opts.id)!;
}

export function upsertGoogleUser(opts: { google_id: string; email: string; name: string; avatar_url?: string }): User {
  const existing = getUserByGoogleId(opts.google_id);
  if (existing) {
    db.prepare('UPDATE users SET avatar_url = ? WHERE google_id = ?').run(opts.avatar_url ?? null, opts.google_id);
    return { ...existing, avatar_url: opts.avatar_url ?? null };
  }
  return createUser({ id: randomBytes(16).toString('hex'), ...opts });
}

// ─── Sessions ────────────────────────────────────────────────────────────────

const SESSION_TTL_DAYS = 30;

export function createSession(userId: string): string {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)').run(
    randomBytes(16).toString('hex'), userId, token, expiresAt,
  );
  return token;
}

export function getSessionUser(token: string): User | null {
  const row = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.avatar_url, u.created_at, u.username
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) as User | null;
  return row;
}

export function requireAdmin(req: Request): User {
  const user = getUserFromRequest(req);
  if (!user) throw Object.assign(new Error('Not authenticated'), { status: 401 });
  if (user.role !== 'admin') throw Object.assign(new Error('Admin required'), { status: 403 });
  return user;
}

export function deleteSession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function updateUser(id: string, updates: { name?: string; bio?: string | null; username?: string }): void {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name); }
  if ('bio' in updates) { sets.push('bio = ?'); values.push(updates.bio ?? null); }
  if (updates.username !== undefined) { sets.push('username = ?'); values.push(updates.username); }
  if (!sets.length) return;
  values.push(id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

/** Full user row including auth-sensitive fields — only for account settings. */
export function getUserFull(id: string): (User & { google_id: string | null; password_hash: string | null; bio: string | null; username: string | null }) | null {
  return db.prepare('SELECT id, email, name, role, avatar_url, created_at, google_id, password_hash, bio, username FROM users WHERE id = ?').get(id) as (User & { google_id: string | null; password_hash: string | null; bio: string | null; username: string | null }) | null;
}

export function updateUserEmail(id: string, newEmail: string): void {
  const email = newEmail.toLowerCase().trim();
  const conflict = getUserByEmail(email);
  if (conflict && conflict.id !== id) throw new Error('That email address is already in use.');
  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, id);
}

export async function changeUserPassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(id) as { password_hash: string | null } | undefined;
  if (!row?.password_hash) throw new Error('This account uses Google sign-in — no password is set.');
  const valid = await verifyPassword(currentPassword, row.password_hash);
  if (!valid) throw new Error('Current password is incorrect.');
  if (newPassword.length < 8) throw new Error('New password must be at least 8 characters.');
  const hash = await hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
}

// ─── Password reset tokens ────────────────────────────────────────────────────

const RESET_TOKEN_TTL_HOURS = 1;

/** Generate a raw reset token, store its SHA-256 hash, return the raw token. */
export function createPasswordResetToken(userId: string): string {
  const raw = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_HOURS * 3600 * 1000).toISOString();
  const id = randomBytes(16).toString('hex');
  db.prepare(`
    INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(id, userId, hash, expiresAt);
  return raw;
}

/**
 * Validate a raw token: checks hash, expiry, not-used.
 * Marks token as used on success. Returns userId or null.
 */
export function consumePasswordResetToken(rawToken: string): string | null {
  const hash = createHash('sha256').update(rawToken).digest('hex');
  const row = db.prepare(`
    SELECT id, user_id FROM password_reset_tokens
    WHERE token_hash = ? AND expires_at > datetime('now') AND used_at IS NULL
  `).get(hash) as { id: string; user_id: string } | undefined;
  if (!row) return null;
  db.prepare(`UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?`).run(row.id);
  return row.user_id;
}

/** Set a new password for a user (skips current-password check — used after token validation). */
export async function setUserPassword(userId: string, newPassword: string): Promise<void> {
  if (newPassword.length < 8) throw new Error('Password must be at least 8 characters.');
  const hash = await hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
}

export function deleteUser(id: string): void {
  // Decks have no ON DELETE CASCADE so remove them first; entries/likes/comments cascade from decks
  const deckIds = db.prepare('SELECT id FROM decks WHERE user_id = ?').all(id) as { id: string }[];
  for (const { id: did } of deckIds) db.prepare('DELETE FROM decks WHERE id = ?').run(did);
  // Sessions, collection, folders, likes, comments all have ON DELETE CASCADE
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

export function getUserFromRequest(req: Request): User | null {
  const cookie = req.headers.get('cookie') ?? '';
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;
  return getSessionUser(decodeURIComponent(match[1]));
}
