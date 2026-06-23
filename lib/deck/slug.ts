/**
 * Public-slug generation for shareable deck URLs (/d/<slug>).
 */

import { randomBytes } from 'crypto';
import { getDb } from '../db/connection';

/** Generate a unique 8-char alphanumeric slug not already in use. */
export function generatePublicSlug(): string {
  const db = getDb();
  for (let i = 0; i < 10; i++) {
    const slug = randomBytes(5).toString('base64url').slice(0, 8);
    const existing = db.prepare('SELECT id FROM decks WHERE public_slug = ?').get(slug);
    if (!existing) return slug;
  }
  // Fallback: longer slug to virtually guarantee uniqueness
  return randomBytes(10).toString('base64url').slice(0, 12);
}

/** Look up a deck id by its public slug. Returns null if not found. */
export function getDeckIdBySlug(slug: string): string | null {
  const row = db_get(slug);
  return row?.id ?? null;
}

function db_get(slug: string): { id: string } | undefined {
  const db = getDb();
  return db.prepare('SELECT id FROM decks WHERE public_slug = ?').get(slug) as { id: string } | undefined;
}
