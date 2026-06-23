import { getDb } from '@/lib/db/connection';
import { randomUUID } from 'crypto';

export interface WishlistEntry {
  id: string;
  oracle_id: string;
  scryfall_id: string | null;
  quantity: number;
  finish: string;
  condition_floor: string;
  priority: number;
  notes: string | null;
  card_name: string;
  created_at: string;
  updated_at: string;
}

export interface EnrichedWishlistEntry extends WishlistEntry {
  image_url: string | null;
  set_code: string | null;
  collector_number: string | null;
  type_line: string | null;
  price_usd: number | null;
}

export function getWishlist(userId: string): WishlistEntry[] {
  return getDb().prepare(
    'SELECT * FROM user_wishlist WHERE user_id = ? ORDER BY priority DESC, created_at DESC'
  ).all(userId) as WishlistEntry[];
}

export function getWishlistWithCards(userId: string): EnrichedWishlistEntry[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      w.id, w.oracle_id, w.scryfall_id, w.quantity, w.finish,
      w.condition_floor, w.priority, w.notes, w.card_name,
      w.created_at, w.updated_at,
      sc.image_uris_json, sc.set_code, sc.collector_number, sc.type_line, sc.prices_json
    FROM user_wishlist w
    LEFT JOIN scryfall_cards sc ON sc.scryfall_id = w.scryfall_id OR (w.scryfall_id IS NULL AND sc.oracle_id = w.oracle_id)
    WHERE w.user_id = ?
    GROUP BY w.id
    ORDER BY w.priority DESC, w.created_at DESC
  `).all(userId) as (WishlistEntry & {
    image_uris_json: string | null;
    prices_json: string | null;
  })[];

  return rows.map(r => {
    let price_usd: number | null = null;
    if (r.prices_json) {
      try {
        const p = JSON.parse(r.prices_json) as { usd?: string | null; usd_foil?: string | null };
        const raw = r.finish === 'foil' ? (p.usd_foil ?? p.usd) : p.usd;
        price_usd = raw ? parseFloat(raw) : null;
      } catch {}
    }
    return {
      id: r.id,
      oracle_id: r.oracle_id,
      scryfall_id: r.scryfall_id,
      quantity: r.quantity,
      finish: r.finish,
      condition_floor: r.condition_floor,
      priority: r.priority,
      notes: r.notes,
      card_name: r.card_name,
      created_at: r.created_at,
      updated_at: r.updated_at,
      image_url: r.image_uris_json ? ((JSON.parse(r.image_uris_json) as Record<string, string>).normal ?? null) : null,
      set_code: (r as unknown as { set_code: string | null }).set_code ?? null,
      collector_number: (r as unknown as { collector_number: string | null }).collector_number ?? null,
      type_line: (r as unknown as { type_line: string | null }).type_line ?? null,
      price_usd,
    };
  });
}

export function upsertWishlistEntry(userId: string, entry: {
  oracle_id: string;
  scryfall_id?: string | null;
  card_name: string;
  quantity: number;
  finish: string;
  condition_floor?: string;
  priority?: number;
  notes?: string | null;
}): void {
  const db = getDb();
  if (entry.quantity <= 0) {
    db.prepare('DELETE FROM user_wishlist WHERE user_id = ? AND oracle_id = ? AND finish = ?')
      .run(userId, entry.oracle_id, entry.finish);
    return;
  }
  db.prepare(`
    INSERT INTO user_wishlist (id, user_id, oracle_id, scryfall_id, card_name, quantity, finish, condition_floor, priority, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, oracle_id, finish) DO UPDATE SET
      scryfall_id     = COALESCE(excluded.scryfall_id, scryfall_id),
      card_name       = excluded.card_name,
      quantity        = excluded.quantity,
      condition_floor = excluded.condition_floor,
      priority        = excluded.priority,
      notes           = excluded.notes,
      updated_at      = datetime('now')
  `).run(
    randomUUID(), userId, entry.oracle_id, entry.scryfall_id ?? null,
    entry.card_name, entry.quantity, entry.finish,
    entry.condition_floor ?? 'lp', entry.priority ?? 0, entry.notes ?? null,
  );
}

export function deleteWishlistEntry(userId: string, oracleId: string, finish: string): void {
  getDb().prepare('DELETE FROM user_wishlist WHERE user_id = ? AND oracle_id = ? AND finish = ?')
    .run(userId, oracleId, finish);
}

export function getWishlistOracleIds(userId: string): Set<string> {
  const rows = getDb().prepare('SELECT DISTINCT oracle_id FROM user_wishlist WHERE user_id = ?')
    .all(userId) as { oracle_id: string }[];
  return new Set(rows.map(r => r.oracle_id));
}

/** Move a wishlist entry to the collection (mark as owned) and remove from wishlist. */
export function moveWishlistToCollection(
  userId: string,
  oracleId: string,
  finish: string,
  quantity: number,
): void {
  const db = getDb();
  const foil = finish === 'foil' || finish === 'etched' ? 1 : 0;
  db.transaction(() => {
    // Upsert into collection — add qty to any existing
    const existing = db.prepare(
      'SELECT quantity FROM user_collection WHERE user_id = ? AND oracle_id = ? AND foil = ?'
    ).get(userId, oracleId, foil) as { quantity: number } | undefined;
    const newQty = (existing?.quantity ?? 0) + quantity;
    db.prepare(`
      INSERT INTO user_collection (id, user_id, oracle_id, quantity, foil, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, oracle_id, foil) DO UPDATE SET quantity = ?, updated_at = datetime('now')
    `).run(randomUUID(), userId, oracleId, newQty, foil, newQty);
    // Remove from wishlist
    db.prepare('DELETE FROM user_wishlist WHERE user_id = ? AND oracle_id = ? AND finish = ?')
      .run(userId, oracleId, finish);
  })();
}
