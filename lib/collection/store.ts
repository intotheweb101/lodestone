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

/** Mark/unmark a collection card as "for trade". */
export function setForTrade(userId: string, oracleId: string, forTrade: boolean): void {
  const db = getDb();
  db.prepare(
    `UPDATE user_collection SET for_trade = ? WHERE user_id = ? AND oracle_id = ?`
  ).run(forTrade ? 1 : 0, userId, oracleId);
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
  for_trade: boolean;
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

export interface TradeMatch {
  oracle_id: string;
  card_name: string;
  image_url: string | null;
  /** Users who want a card I have for trade */
  wanted_by: { user_id: string; username: string | null; name: string }[];
  /** Users who have a card I want and it's for trade */
  offered_by: { user_id: string; username: string | null; name: string }[];
}

/** Cards I have marked "for trade" that others want, plus cards others offer that I want. */
export function getTradeMatches(userId: string): {
  myTradesWanted: { oracle_id: string; card_name: string; image_url: string | null; wanted_by: { user_id: string; username: string | null; name: string }[] }[];
  othersHaveWanted: { oracle_id: string; card_name: string; image_url: string | null; offered_by: { user_id: string; username: string | null; name: string }[] }[];
} {
  const db = getDb();

  // Cards I have for trade that others are wishing for
  const myTradeRows = db.prepare(`
    SELECT
      uc.oracle_id,
      COALESCE(sc.name, uc.oracle_id) AS card_name,
      sc.image_uris_json,
      u.id AS user_id, u.username, u.name AS user_name
    FROM user_collection uc
    JOIN user_wishlist uw ON uw.oracle_id = uc.oracle_id AND uw.user_id != uc.user_id
    JOIN users u ON u.id = uw.user_id
    LEFT JOIN scryfall_cards sc ON sc.oracle_id = uc.oracle_id
    WHERE uc.user_id = ? AND uc.for_trade = 1
    GROUP BY uc.oracle_id, u.id
    ORDER BY card_name
  `).all(userId) as {
    oracle_id: string; card_name: string; image_uris_json: string | null;
    user_id: string; username: string | null; user_name: string;
  }[];

  // Cards on my wishlist that others have for trade
  const othersHaveRows = db.prepare(`
    SELECT
      uw.oracle_id,
      COALESCE(sc.name, uw.card_name) AS card_name,
      sc.image_uris_json,
      u.id AS user_id, u.username, u.name AS user_name
    FROM user_wishlist uw
    JOIN user_collection uc ON uc.oracle_id = uw.oracle_id AND uc.user_id != uw.user_id AND uc.for_trade = 1
    JOIN users u ON u.id = uc.user_id
    LEFT JOIN scryfall_cards sc ON sc.oracle_id = uw.oracle_id
    WHERE uw.user_id = ?
    GROUP BY uw.oracle_id, u.id
    ORDER BY card_name
  `).all(userId) as {
    oracle_id: string; card_name: string; image_uris_json: string | null;
    user_id: string; username: string | null; user_name: string;
  }[];

  function parseImageUrl(json: string | null): string | null {
    if (!json) return null;
    try { return (JSON.parse(json) as Record<string, string>).normal ?? null; } catch { return null; }
  }

  // Group by oracle_id
  const myTradesMap = new Map<string, { oracle_id: string; card_name: string; image_url: string | null; wanted_by: { user_id: string; username: string | null; name: string }[] }>();
  for (const r of myTradeRows) {
    if (!myTradesMap.has(r.oracle_id)) {
      myTradesMap.set(r.oracle_id, { oracle_id: r.oracle_id, card_name: r.card_name, image_url: parseImageUrl(r.image_uris_json), wanted_by: [] });
    }
    myTradesMap.get(r.oracle_id)!.wanted_by.push({ user_id: r.user_id, username: r.username, name: r.user_name });
  }

  const othersHaveMap = new Map<string, { oracle_id: string; card_name: string; image_url: string | null; offered_by: { user_id: string; username: string | null; name: string }[] }>();
  for (const r of othersHaveRows) {
    if (!othersHaveMap.has(r.oracle_id)) {
      othersHaveMap.set(r.oracle_id, { oracle_id: r.oracle_id, card_name: r.card_name, image_url: parseImageUrl(r.image_uris_json), offered_by: [] });
    }
    othersHaveMap.get(r.oracle_id)!.offered_by.push({ user_id: r.user_id, username: r.username, name: r.user_name });
  }

  return {
    myTradesWanted: Array.from(myTradesMap.values()),
    othersHaveWanted: Array.from(othersHaveMap.values()),
  };
}

export interface ValueHistoryPoint {
  snapshot_date: string;
  value_usd: number;
  card_count: number;
}

/**
 * Compute the current USD value and card count for a user's collection.
 * Cheaper than getCollectionWithCards — only reads the columns needed.
 */
export function getCollectionValueUsd(userId: string): { value_usd: number; card_count: number } {
  const db = getDb();
  const rows = db.prepare(`
    SELECT uc.quantity, uc.foil, sc.prices_json
    FROM user_collection uc
    LEFT JOIN scryfall_cards sc ON sc.oracle_id = uc.oracle_id
    WHERE uc.user_id = ?
  `).all(userId) as { quantity: number; foil: number; prices_json: string | null }[];

  let value_usd = 0;
  let card_count = 0;
  for (const r of rows) {
    card_count += r.quantity;
    if (r.prices_json) {
      try {
        const p = JSON.parse(r.prices_json) as { usd?: string | null; usd_foil?: string | null };
        const raw = r.foil ? (p.usd_foil ?? p.usd) : p.usd;
        if (raw) value_usd += parseFloat(raw) * r.quantity;
      } catch { /* ignore malformed */ }
    }
  }
  return { value_usd, card_count };
}

/** Write (or overwrite) today's value snapshot for a user. */
export function snapshotCollectionValue(userId: string): void {
  const { value_usd, card_count } = getCollectionValueUsd(userId);
  const db = getDb();
  db.prepare(`
    INSERT INTO collection_value_history (user_id, snapshot_date, value_usd, card_count)
    VALUES (?, date('now'), ?, ?)
    ON CONFLICT(user_id, snapshot_date) DO UPDATE SET
      value_usd  = excluded.value_usd,
      card_count = excluded.card_count
  `).run(userId, value_usd, card_count);
}

/** Return up to `days` daily value snapshots, oldest first. */
export function getCollectionValueHistory(userId: string, days = 90): ValueHistoryPoint[] {
  const db = getDb();
  return db.prepare(`
    SELECT snapshot_date, value_usd, card_count
    FROM collection_value_history
    WHERE user_id = ?
      AND snapshot_date >= date('now', '-' || ? || ' days')
    ORDER BY snapshot_date ASC
  `).all(userId, days) as ValueHistoryPoint[];
}

export function getCollectionWithCards(userId: string): EnrichedCollectionEntry[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      uc.oracle_id, uc.scryfall_id, uc.quantity, uc.foil, uc.for_trade, uc.notes, uc.updated_at,
      sc.name, sc.image_uris_json, sc.set_code, sc.collector_number, sc.type_line,
      sc.prices_json
    FROM user_collection uc
    LEFT JOIN scryfall_cards sc ON sc.oracle_id = uc.oracle_id
    WHERE uc.user_id = ?
    GROUP BY uc.oracle_id, uc.foil
    ORDER BY uc.updated_at DESC
  `).all(userId) as (Omit<EnrichedCollectionEntry, 'foil' | 'for_trade' | 'image_url' | 'price_usd'> & {
    foil: number; for_trade: number; image_uris_json: string | null; prices_json: string | null;
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
      for_trade: Boolean(r.for_trade),
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
