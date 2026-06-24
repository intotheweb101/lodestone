/**
 * Card packages — reusable named card bundles that can be inserted into any deck.
 * Mirrors the deck_folders pattern.
 */

import { getDb } from '../db/connection';
import { randomUUID } from 'crypto';

export interface CardPackage {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  entry_count: number;
}

export interface PackageEntry {
  id: string;
  package_id: string;
  oracle_id: string;
  card_name: string;
  quantity: number;
  board: string;
  category: string | null;
}

// ─── Read ──────────────────────────────────────────────────────────────────────

export function listPackages(userId: string): CardPackage[] {
  return getDb().prepare(`
    SELECT p.id, p.user_id, p.name, p.description, p.created_at,
           COUNT(e.id) AS entry_count
    FROM card_packages p
    LEFT JOIN package_entries e ON e.package_id = p.id
    WHERE p.user_id = ?
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all(userId) as CardPackage[];
}

export function getPackage(id: string, userId: string): CardPackage | null {
  return getDb().prepare(
    `SELECT p.id, p.user_id, p.name, p.description, p.created_at,
            COUNT(e.id) AS entry_count
     FROM card_packages p
     LEFT JOIN package_entries e ON e.package_id = p.id
     WHERE p.id = ? AND p.user_id = ?
     GROUP BY p.id`
  ).get(id, userId) as CardPackage | null;
}

export function getPackageEntries(packageId: string): PackageEntry[] {
  return getDb().prepare(
    'SELECT * FROM package_entries WHERE package_id = ? ORDER BY card_name'
  ).all(packageId) as PackageEntry[];
}

// ─── Write ─────────────────────────────────────────────────────────────────────

export function createPackage(userId: string, name: string, description?: string): CardPackage {
  const id = randomUUID();
  const db = getDb();
  db.prepare('INSERT INTO card_packages (id, user_id, name, description) VALUES (?, ?, ?, ?)').run(
    id, userId, name, description ?? null
  );
  return { id, user_id: userId, name, description: description ?? null, created_at: new Date().toISOString(), entry_count: 0 };
}

export function addEntryToPackage(packageId: string, entry: {
  oracle_id: string;
  card_name: string;
  quantity?: number;
  board?: string;
  category?: string;
}): PackageEntry {
  const id = randomUUID();
  const db = getDb();

  // Upsert by oracle_id + board so the same card doesn't appear twice
  const existing = db.prepare(
    'SELECT id, quantity FROM package_entries WHERE package_id = ? AND oracle_id = ? AND board = ?'
  ).get(packageId, entry.oracle_id, entry.board ?? 'main') as { id: string; quantity: number } | undefined;

  if (existing) {
    db.prepare('UPDATE package_entries SET quantity = ? WHERE id = ?').run(
      (existing.quantity ?? 1) + (entry.quantity ?? 1),
      existing.id
    );
    return { id: existing.id, package_id: packageId, ...entry, quantity: (existing.quantity ?? 1) + (entry.quantity ?? 1), board: entry.board ?? 'main', category: entry.category ?? null };
  }

  db.prepare(`
    INSERT INTO package_entries (id, package_id, oracle_id, card_name, quantity, board, category)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, packageId, entry.oracle_id, entry.card_name, entry.quantity ?? 1, entry.board ?? 'main', entry.category ?? null);

  return { id, package_id: packageId, oracle_id: entry.oracle_id, card_name: entry.card_name, quantity: entry.quantity ?? 1, board: entry.board ?? 'main', category: entry.category ?? null };
}

export function removeEntryFromPackage(entryId: string, packageId: string): void {
  getDb().prepare('DELETE FROM package_entries WHERE id = ? AND package_id = ?').run(entryId, packageId);
}

export function updatePackageMeta(id: string, userId: string, name: string, description?: string): void {
  getDb().prepare('UPDATE card_packages SET name = ?, description = ? WHERE id = ? AND user_id = ?').run(
    name, description ?? null, id, userId
  );
}

export function deletePackage(id: string, userId: string): void {
  getDb().prepare('DELETE FROM card_packages WHERE id = ? AND user_id = ?').run(id, userId);
}
