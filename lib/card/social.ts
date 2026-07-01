/**
 * Card-level social: comments (with one level of replies) and upvotes.
 * Mirrors lib/deck/store.ts social functions (toggleLike, addComment, etc.)
 * but keyed on oracle_id rather than deck_id.
 */

import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db/connection';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CardComment {
  id: string;
  oracle_id: string;
  user_id: string;
  user_name: string;
  body: string;
  parent_id: string | null;
  created_at: string;
}

// ─── Comments ──────────────────────────────────────────────────────────────

export function getCardComments(oracleId: string): CardComment[] {
  const db = getDb();
  return db.prepare(`
    SELECT cc.id, cc.oracle_id, cc.user_id, u.name AS user_name, cc.body, cc.parent_id, cc.created_at
    FROM card_comments cc
    JOIN users u ON u.id = cc.user_id
    WHERE cc.oracle_id = ?
    ORDER BY cc.created_at ASC
  `).all(oracleId) as CardComment[];
}

export function deleteCardComment(commentId: string): void {
  getDb().prepare('DELETE FROM card_comments WHERE id = ?').run(commentId);
}

export function editCardComment(commentId: string, body: string): void {
  getDb().prepare('UPDATE card_comments SET body = ? WHERE id = ?').run(body.trim(), commentId);
}

export function getCardComment(commentId: string): { id: string; oracle_id: string; user_id: string; body: string } | null {
  return getDb().prepare('SELECT id, oracle_id, user_id, body FROM card_comments WHERE id = ?').get(commentId) as { id: string; oracle_id: string; user_id: string; body: string } | null;
}

export function addCardComment({
  oracleId,
  userId,
  body,
  parentId,
}: {
  oracleId: string;
  userId: string;
  body: string;
  parentId?: string;
}): CardComment {
  const db = getDb();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO card_comments (id, oracle_id, user_id, body, parent_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, oracleId, userId, body.trim(), parentId ?? null);
  const row = db.prepare(`
    SELECT cc.id, cc.oracle_id, cc.user_id, u.name AS user_name, cc.body, cc.parent_id, cc.created_at
    FROM card_comments cc JOIN users u ON u.id = cc.user_id
    WHERE cc.id = ?
  `).get(id) as CardComment;
  return row;
}

// ─── Upvotes ───────────────────────────────────────────────────────────────

export function toggleCardUpvote(userId: string, oracleId: string): { upvoted: boolean } {
  const db = getDb();
  const existing = db.prepare(
    `SELECT 1 FROM card_upvotes WHERE user_id = ? AND oracle_id = ?`
  ).get(userId, oracleId);
  if (existing) {
    db.prepare(`DELETE FROM card_upvotes WHERE user_id = ? AND oracle_id = ?`).run(userId, oracleId);
    return { upvoted: false };
  }
  db.prepare(`INSERT INTO card_upvotes (user_id, oracle_id) VALUES (?, ?)`).run(userId, oracleId);
  return { upvoted: true };
}

export function getCardUpvotes(oracleId: string): number {
  const db = getDb();
  const row = db.prepare(
    `SELECT COUNT(*) AS cnt FROM card_upvotes WHERE oracle_id = ?`
  ).get(oracleId) as { cnt: number };
  return row.cnt;
}

export function getUserUpvotedCard(userId: string, oracleId: string): boolean {
  const db = getDb();
  return !!db.prepare(
    `SELECT 1 FROM card_upvotes WHERE user_id = ? AND oracle_id = ?`
  ).get(userId, oracleId);
}
