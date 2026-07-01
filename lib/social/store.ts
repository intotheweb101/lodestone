import { getDb } from '../db/connection';
import { randomUUID } from 'crypto';

// ─── Following ────────────────────────────────────────────────────────────────

export function toggleFollow(followerId: string, followeeId: string): { following: boolean } {
  if (followerId === followeeId) throw new Error('Cannot follow yourself');
  const db = getDb();
  const existing = db.prepare(
    'SELECT 1 FROM user_follows WHERE follower_id = ? AND followee_id = ?'
  ).get(followerId, followeeId);
  if (existing) {
    db.prepare('DELETE FROM user_follows WHERE follower_id = ? AND followee_id = ?').run(followerId, followeeId);
    return { following: false };
  }
  db.prepare('INSERT INTO user_follows (follower_id, followee_id) VALUES (?, ?)').run(followerId, followeeId);
  return { following: true };
}

export function isFollowing(followerId: string, followeeId: string): boolean {
  return Boolean(
    getDb().prepare(
      'SELECT 1 FROM user_follows WHERE follower_id = ? AND followee_id = ?'
    ).get(followerId, followeeId)
  );
}

export function getFollowerCount(userId: string): number {
  const row = getDb().prepare('SELECT COUNT(*) as n FROM user_follows WHERE followee_id = ?').get(userId) as { n: number };
  return row.n;
}

export function getFollowingCount(userId: string): number {
  const row = getDb().prepare('SELECT COUNT(*) as n FROM user_follows WHERE follower_id = ?').get(userId) as { n: number };
  return row.n;
}

export interface FollowUser {
  id: string;
  username: string | null;
  name: string;
}

export function getFollowers(userId: string): FollowUser[] {
  return getDb().prepare(`
    SELECT u.id, u.username, u.name FROM user_follows f
    JOIN users u ON u.id = f.follower_id
    WHERE f.followee_id = ?
    ORDER BY f.created_at DESC
  `).all(userId) as FollowUser[];
}

export function getFollowing(userId: string): FollowUser[] {
  return getDb().prepare(`
    SELECT u.id, u.username, u.name FROM user_follows f
    JOIN users u ON u.id = f.followee_id
    WHERE f.follower_id = ?
    ORDER BY f.created_at DESC
  `).all(userId) as FollowUser[];
}

// ─── Notifications ─────────────────────────────────────────────────────────

export type NotificationType = 'like' | 'comment' | 'follow' | 'price';

export interface Notification {
  id: string;
  user_id: string;
  actor_id: string;
  actor_name: string;
  type: NotificationType;
  deck_id: string | null;
  deck_name: string | null;
  deck_slug: string | null;
  comment_id: string | null;
  note_text: string | null;
  read: boolean;
  created_at: string;
}

export function createNotification(opts: {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  deckId?: string;
  commentId?: string;
}): void {
  const { recipientId, actorId, type, deckId, commentId } = opts;
  if (recipientId === actorId || recipientId === 'local') return;
  const db = getDb();
  // Dedupe: don't create duplicate like/follow notifications
  if (type === 'like' || type === 'follow') {
    const exists = db.prepare(
      'SELECT 1 FROM notifications WHERE user_id = ? AND actor_id = ? AND type = ? AND deck_id IS ?'
    ).get(recipientId, actorId, type, deckId ?? null);
    if (exists) return;
  }
  db.prepare(
    'INSERT INTO notifications (id, user_id, actor_id, type, deck_id, comment_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(randomUUID(), recipientId, actorId, type, deckId ?? null, commentId ?? null);
}

/** Create a system price-alert notification (actor = recipient, no social loop). */
export function createPriceNotification(opts: {
  userId: string;
  cardName: string;
  bestPriceNzd: number;
  targetNzd: number;
}): void {
  if (opts.userId === 'local') return;
  const db = getDb();
  const noteText = `${opts.cardName} dropped to $${opts.bestPriceNzd.toFixed(2)} NZD (target $${opts.targetNzd.toFixed(2)})`;
  db.prepare(
    'INSERT INTO notifications (id, user_id, actor_id, type, deck_id, comment_id, note_text) VALUES (?, ?, ?, ?, NULL, NULL, ?)'
  ).run(randomUUID(), opts.userId, opts.userId, 'price', noteText);
}

export function getNotifications(userId: string, limit = 30): Notification[] {
  return (getDb().prepare(`
    SELECT n.id, n.user_id, n.actor_id, n.type, n.deck_id, n.comment_id, n.note_text, n.read, n.created_at,
           u.name AS actor_name,
           d.name AS deck_name,
           d.public_slug AS deck_slug
    FROM notifications n
    JOIN users u ON u.id = n.actor_id
    LEFT JOIN decks d ON d.id = n.deck_id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
    LIMIT ?
  `).all(userId, limit) as (Omit<Notification, 'read' | 'actor_name' | 'deck_name' | 'deck_slug'> & { read: number; actor_name: string; deck_name: string | null; deck_slug: string | null; note_text: string | null })[]).map(r => ({
    ...r,
    read: !!r.read,
  }));
}

export function getUnreadCount(userId: string): number {
  const row = getDb().prepare('SELECT COUNT(*) as n FROM notifications WHERE user_id = ? AND read = 0').get(userId) as { n: number };
  return row.n;
}

export function markAllRead(userId: string): void {
  getDb().prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(userId);
}

export function markRead(notificationId: string, userId: string): void {
  getDb().prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(notificationId, userId);
}

// ─── Activity feed ────────────────────────────────────────────────────────────

export interface FeedItem {
  type: 'deck_updated' | 'like';
  actor_id: string;
  actor_name: string;
  actor_username: string | null;
  deck_id: string;
  deck_name: string;
  deck_slug: string | null;
  ts: string;
}

export function getActivityFeed(userId: string, limit = 40, offset = 0): FeedItem[] {
  // Only show activity from people the user follows, for public decks
  return getDb().prepare(`
    SELECT type, actor_id, actor_name, actor_username, deck_id, deck_name, deck_slug, ts FROM (
      SELECT 'deck_updated' AS type,
             u.id AS actor_id, u.name AS actor_name, u.username AS actor_username,
             d.id AS deck_id, d.name AS deck_name, d.public_slug AS deck_slug,
             d.updated_at AS ts
      FROM decks d
      JOIN users u ON u.id = d.user_id
      WHERE d.visibility = 'public'
        AND d.user_id IN (SELECT followee_id FROM user_follows WHERE follower_id = ?)
      UNION ALL
      SELECT 'like' AS type,
             u.id AS actor_id, u.name AS actor_name, u.username AS actor_username,
             d.id AS deck_id, d.name AS deck_name, d.public_slug AS deck_slug,
             l.created_at AS ts
      FROM deck_likes l
      JOIN users u ON u.id = l.user_id
      JOIN decks d ON d.id = l.deck_id
      WHERE d.visibility = 'public'
        AND l.user_id IN (SELECT followee_id FROM user_follows WHERE follower_id = ?)
    )
    ORDER BY ts DESC
    LIMIT ? OFFSET ?
  `).all(userId, userId, limit, offset) as FeedItem[];
}
