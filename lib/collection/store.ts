import { getDb } from '@/lib/db/connection';
import { randomUUID } from 'crypto';

export interface CollectionEntry {
  oracle_id: string;
  scryfall_id: string | null;
  quantity: number;
  foil: boolean;
  notes: string | null;
  updated_at: string;
}

export function getCollection(userId: string): CollectionEntry[] {
  const db = getDb();
  return db.prepare(`
    SELECT oracle_id, scryfall_id, quantity, foil, notes, updated_at
    FROM user_collection WHERE user_id = ? ORDER BY updated_at DESC
  `).all(userId) as CollectionEntry[];
}

export function getCollectionMap(userId: string): Map<string, { quantity: number; foil: boolean }> {
  const db = getDb();
  const rows = db.prepare('SELECT oracle_id, quantity, foil FROM user_collection WHERE user_id = ?').all(userId) as { oracle_id: string; quantity: number; foil: number }[];
  const map = new Map<string, { quantity: number; foil: boolean }>();
  for (const r of rows) map.set(r.oracle_id + ':' + (r.foil ? '1' : '0'), { quantity: r.quantity, foil: !!r.foil });
  return map;
}

export function upsertCollectionEntry(userId: string, oracleId: string, opts: {
  scryfall_id?: string;
  quantity: number;
  foil: boolean;
  notes?: string;
}): void {
  const db = getDb();
  if (opts.quantity <= 0) {
    db.prepare('DELETE FROM user_collection WHERE user_id = ? AND oracle_id = ? AND foil = ?').run(userId, oracleId, opts.foil ? 1 : 0);
    return;
  }
  db.prepare(`
    INSERT INTO user_collection (id, user_id, oracle_id, scryfall_id, quantity, foil, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, oracle_id, foil) DO UPDATE SET
      quantity = excluded.quantity,
      scryfall_id = COALESCE(excluded.scryfall_id, scryfall_id),
      notes = excluded.notes,
      updated_at = datetime('now')
  `).run(randomUUID(), userId, oracleId, opts.scryfall_id ?? null, opts.quantity, opts.foil ? 1 : 0, opts.notes ?? null);
}

export function deleteCollectionEntry(userId: string, oracleId: string, foil: boolean): void {
  const db = getDb();
  db.prepare('DELETE FROM user_collection WHERE user_id = ? AND oracle_id = ? AND foil = ?').run(userId, oracleId, foil ? 1 : 0);
}

export function getCollectionOracleIds(userId: string): Set<string> {
  const db = getDb();
  const rows = db.prepare('SELECT DISTINCT oracle_id FROM user_collection WHERE user_id = ?').all(userId) as { oracle_id: string }[];
  return new Set(rows.map(r => r.oracle_id));
}

export interface EnrichedCollectionEntry {
  oracle_id: string;
  scryfall_id: string | null;
  quantity: number;
  foil: boolean;
  notes: string | null;
  updated_at: string;
  name: string;
  image_url: string | null;
  set_code: string | null;
  collector_number: string | null;
  type_line: string | null;
  /** USD price per single card (null if unknown) */
  price_usd: number | null;
}

export function getCollectionWithCards(userId: string): EnrichedCollectionEntry[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      uc.oracle_id, uc.scryfall_id, uc.quantity, uc.foil, uc.notes, uc.updated_at,
      sc.name, sc.image_uris_json, sc.set_code, sc.collector_number, sc.type_line,
      sc.prices_json
    FROM user_collection uc
    LEFT JOIN scryfall_cards sc ON sc.oracle_id = uc.oracle_id
    WHERE uc.user_id = ?
    GROUP BY uc.oracle_id, uc.foil
    ORDER BY uc.updated_at DESC
  `).all(userId) as (Omit<EnrichedCollectionEntry, 'foil' | 'image_url' | 'price_usd'> & {
    foil: number; image_uris_json: string | null; prices_json: string | null;
  })[];

  return rows.map(r => {
    let price_usd: number | null = null;
    if (r.prices_json) {
      try {
        const p = JSON.parse(r.prices_json) as { usd?: string | null; usd_foil?: string | null };
        const raw = r.foil ? (p.usd_foil ?? p.usd) : p.usd;
        price_usd = raw ? parseFloat(raw) : null;
      } catch { /* ignore malformed */ }
    }
    return {
      oracle_id: r.oracle_id,
      scryfall_id: r.scryfall_id,
      quantity: r.quantity,
      foil: Boolean(r.foil),
      notes: r.notes,
      updated_at: r.updated_at,
      name: r.name ?? 'Unknown Card',
      image_url: r.image_uris_json ? (JSON.parse(r.image_uris_json) as Record<string, string>).normal ?? null : null,
      set_code: r.set_code ?? null,
      collector_number: r.collector_number ?? null,
      type_line: r.type_line ?? null,
      price_usd,
    };
  });
}
