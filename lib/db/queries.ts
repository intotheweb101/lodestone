import { getDb } from './connection';

// ---- Shops ----

export interface Shop {
  id: number;
  name: string;
  base_url: string;
  dialect: 'A' | 'B' | 'unknown';
  collection_handles: string[];
  last_synced_at: string | null;
  currency: string;           // 'NZD' | 'AUD'
  shipping_flat: number;
  free_shipping_threshold: number | null;
  region: string;
  enabled: number;            // 1 = active, 0 = disabled
}

export function getAllShops(): Shop[] {
  const rows = getDb().prepare('SELECT * FROM shops WHERE enabled = 1').all() as (Omit<Shop, 'collection_handles'> & { collection_handles: string })[];
  return rows.map(r => ({ ...r, collection_handles: JSON.parse(r.collection_handles) }));
}

export function getAllShopsAdmin(): Shop[] {
  const rows = getDb().prepare('SELECT * FROM shops ORDER BY region, name').all() as (Omit<Shop, 'collection_handles'> & { collection_handles: string })[];
  return rows.map(r => ({ ...r, collection_handles: JSON.parse(r.collection_handles) }));
}

export function updateShopSyncedAt(shopId: number): void {
  getDb().prepare("UPDATE shops SET last_synced_at = datetime('now') WHERE id = ?").run(shopId);
}

// ---- Scryfall cards ----

export interface ScryfallCard {
  scryfall_id: string;
  oracle_id: string;
  name: string;
  name_norm: string;
  set_code: string;
  collector_number: string;
  finishes: string[];
  frame_effects: string[];
  border_color: string | null;
  full_art: boolean;
  color_identity: string[];
  colors: string[];
  mana_cost: string | null;
  cmc: number | null;
  type_line: string | null;
  oracle_text: string | null;
  rarity: string | null;
  legalities: Record<string, string>;
  prices: Record<string, string | null>;
  image_uris: Record<string, string> | null;
  card_faces: unknown[] | null;
  prints_search_uri: string | null;
  // Extended columns added in v3 migrations
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  keywords: string[];
  artist: string | null;
  flavor_text: string | null;
  released_at: string | null;
  // Joined from sets table (when available)
  set_name: string | null;
}

export function parseScryfallRow(row: Record<string, unknown>): ScryfallCard {
  return {
    scryfall_id: row.scryfall_id as string,
    oracle_id: row.oracle_id as string,
    name: row.name as string,
    name_norm: row.name_norm as string,
    set_code: row.set_code as string,
    collector_number: row.collector_number as string,
    finishes: JSON.parse((row.finishes_json as string) ?? '[]'),
    frame_effects: JSON.parse((row.frame_effects_json as string) ?? '[]'),
    border_color: row.border_color as string | null,
    full_art: Boolean(row.full_art),
    color_identity: JSON.parse((row.color_identity_json as string) ?? '[]'),
    colors: JSON.parse((row.colors_json as string) ?? '[]'),
    mana_cost: row.mana_cost as string | null,
    cmc: row.cmc as number | null,
    type_line: row.type_line as string | null,
    oracle_text: row.oracle_text as string | null,
    rarity: row.rarity as string | null,
    legalities: JSON.parse((row.legalities_json as string) ?? '{}'),
    prices: JSON.parse((row.prices_json as string) ?? '{}'),
    image_uris: row.image_uris_json ? JSON.parse(row.image_uris_json as string) : null,
    card_faces: row.card_faces_json ? JSON.parse(row.card_faces_json as string) : null,
    prints_search_uri: row.prints_search_uri as string | null,
    power: (row.power as string | null) ?? null,
    toughness: (row.toughness as string | null) ?? null,
    loyalty: (row.loyalty as string | null) ?? null,
    keywords: JSON.parse((row.keywords_json as string) ?? '[]'),
    artist: (row.artist as string | null) ?? null,
    flavor_text: (row.flavor_text as string | null) ?? null,
    released_at: (row.released_at as string | null) ?? null,
    set_name: (row.set_name as string | null) ?? null,
  };
}

/** Look up a specific printing by set code + collector number. Joins sets for set_name. */
export function getScryfallCardBySetNumber(setCode: string, collectorNumber: string): ScryfallCard | null {
  const row = getDb().prepare(`
    SELECT c.*, s.name as set_name
    FROM scryfall_cards c
    LEFT JOIN sets s ON s.code = c.set_code
    WHERE c.set_code = ? AND c.collector_number = ?
    LIMIT 1
  `).get(setCode.toLowerCase(), collectorNumber) as Record<string, unknown> | undefined;
  return row ? parseScryfallRow(row) : null;
}

export function getScryfallCardById(scryfallId: string): ScryfallCard | null {
  const row = getDb().prepare('SELECT * FROM scryfall_cards WHERE scryfall_id = ?').get(scryfallId) as Record<string, unknown> | undefined;
  return row ? parseScryfallRow(row) : null;
}

export function getScryfallCardsByOracleId(oracleId: string): ScryfallCard[] {
  const rows = getDb().prepare('SELECT * FROM scryfall_cards WHERE oracle_id = ?').all(oracleId) as Record<string, unknown>[];
  return rows.map(parseScryfallRow);
}

export function searchScryfallByName(nameLike: string, limit = 20): ScryfallCard[] {
  // Search by normalized name
  const norm = nameLike.toLowerCase().replace(/[^a-z0-9]/g, '');
  const rows = getDb().prepare(
    "SELECT * FROM scryfall_cards WHERE name_norm LIKE ? GROUP BY oracle_id ORDER BY collector_number LIMIT ?"
  ).all(`%${norm}%`, limit) as Record<string, unknown>[];
  return rows.map(parseScryfallRow);
}

// ---- Advanced search ----

export interface AdvancedSearchResult {
  cards: ScryfallCard[];
  total: number | null;
  page: number;
  pageSize: number;
  errors: string[];
}

/**
 * Scryfall-style advanced search. Parses the raw query string into an AST and
 * compiles it to parameterized SQL. Falls back to name-only search for bare
 * queries (no operators) to preserve backward-compat behavior.
 */
export function searchScryfallAdvanced(
  rawQuery: string,
  opts: { limit?: number; offset?: number; page?: number } = {}
): AdvancedSearchResult {
  const { parseQuery } = require('../search/parser') as typeof import('../search/parser');
  const { compileQuery } = require('../search/compile') as typeof import('../search/compile');

  const limit = opts.limit ?? 60;
  const page = opts.page ?? 1;
  const offset = opts.offset ?? (page - 1) * limit;

  const parsed = parseQuery(rawQuery.trim());

  // Short-circuit: bare name-only query → use the fast indexed path
  const onlyNameTerms = parsed.terms.every(t => t.field === 'name' && t.op === ':' && !t.negate);
  if (onlyNameTerms && !parsed.order && parsed.terms.length <= 1) {
    const nameVal = parsed.terms[0]?.value ?? '';
    const norm = nameVal.replace(/[^a-z0-9]/g, '');
    const db = getDb();
    const rows = db.prepare(
      'SELECT * FROM scryfall_cards WHERE name_norm LIKE ? GROUP BY oracle_id ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?'
    ).all(`%${norm}%`, limit, offset) as Record<string, unknown>[];
    return {
      cards: rows.map(parseScryfallRow),
      total: null,
      page,
      pageSize: limit,
      errors: parsed.errors,
    };
  }

  const db = getDb();
  let cards: ScryfallCard[] = [];

  try {
    const { sql, params } = compileQuery(parsed, { limit, offset });
    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    cards = rows.map(parseScryfallRow);
  } catch (err) {
    // FTS or syntax error — degrade to name-only search
    parsed.errors.push('Search error; falling back to name search.');
    const nameVal = parsed.terms.find(t => t.field === 'name')?.value ?? rawQuery;
    const norm = nameVal.toLowerCase().replace(/[^a-z0-9]/g, '');
    const rows = db.prepare(
      'SELECT * FROM scryfall_cards WHERE name_norm LIKE ? GROUP BY oracle_id ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?'
    ).all(`%${norm}%`, limit, offset) as Record<string, unknown>[];
    cards = rows.map(parseScryfallRow);
  }

  return { cards, total: null, page, pageSize: limit, errors: parsed.errors };
}

// ---- Pricing ----

export interface VariantPrice {
  shop_id: number;
  shop_name: string;
  shop_base_url: string;
  product_id: number;
  variant_id: number;
  finish: string;
  condition: string;
  condition_rank: number;
  price_nzd: number;
  price_original: number | null;  // as listed in the shop (may be AUD)
  currency: string;               // 'NZD' | 'AUD' — the shop's listing currency
  available: number;
  sku: string | null;
  match_key: string | null;
  confidence: string;
  product_url: string | null;
  shop_currency: string;          // from shops.currency — for display
}

export function getPricesByMatchKey(
  matchKey: string,
  conditionRankMax: number = 2, // 0=NM,1=LP,2=MP
  available: boolean = true,
): VariantPrice[] {
  const db = getDb();
  const sql = `
    SELECT
      sv.id as variant_id, sv.shop_id, sv.product_id,
      sv.finish, sv.condition, sv.condition_rank,
      sv.price_nzd, sv.price_original, sv.currency,
      sv.available, sv.sku, sv.match_key, sv.confidence,
      sp.product_url,
      s.name as shop_name, s.base_url as shop_base_url,
      s.currency as shop_currency
    FROM shop_variants sv
    JOIN shop_products sp ON sp.id = sv.product_id
    JOIN shops s ON s.id = sv.shop_id
    WHERE sv.match_key = ?
      AND sv.condition_rank <= ?
      ${available ? 'AND sv.available = 1' : ''}
    ORDER BY sv.price_nzd ASC
  `;
  return db.prepare(sql).all(matchKey, conditionRankMax) as VariantPrice[];
}

export function getPricesByMatchKeys(
  matchKeys: string[],
  conditionRankMax: number = 2,
): VariantPrice[] {
  if (matchKeys.length === 0) return [];
  const db = getDb();
  const placeholders = matchKeys.map(() => '?').join(',');
  const sql = `
    SELECT
      sv.id as variant_id, sv.shop_id, sv.product_id,
      sv.finish, sv.condition, sv.condition_rank,
      sv.price_nzd, sv.price_original, sv.currency,
      sv.available, sv.sku, sv.match_key, sv.confidence,
      sp.product_url,
      s.name as shop_name, s.base_url as shop_base_url,
      s.currency as shop_currency
    FROM shop_variants sv
    JOIN shop_products sp ON sp.id = sv.product_id
    JOIN shops s ON s.id = sv.shop_id
    WHERE sv.match_key IN (${placeholders})
      AND sv.condition_rank <= ?
      AND sv.available = 1
    ORDER BY sv.match_key, sv.price_nzd ASC
  `;
  return db.prepare(sql).all(...matchKeys, conditionRankMax) as VariantPrice[];
}

// ---- Sets ----

export interface SetRow {
  code: string;
  name: string;
  set_type: string | null;
  released_at: string | null;
  card_count: number | null;
  icon_svg_uri: string | null;
}

/** All sets, newest first. Future-dated sets naturally sort to the top (spoiler view). */
export function listSets(): SetRow[] {
  return getDb().prepare(`
    SELECT code, name, set_type, released_at, card_count, icon_svg_uri
    FROM sets
    ORDER BY
      released_at IS NULL ASC,
      released_at DESC,
      name ASC
  `).all() as SetRow[];
}

/**
 * All individual printings in a set, ordered by collector number.
 * Returns every printing (not deduped by oracle_id like the search path).
 */
export function getCardsInSet(setCode: string): ScryfallCard[] {
  const rows = getDb().prepare(`
    SELECT c.*, s.name AS set_name
    FROM scryfall_cards c
    LEFT JOIN sets s ON s.code = c.set_code
    WHERE c.set_code = ?
    ORDER BY
      CASE WHEN c.collector_number GLOB '[0-9]*'
           THEN CAST(c.collector_number AS INTEGER)
           ELSE 9999
      END,
      c.collector_number
  `).all(setCode.toLowerCase()) as Record<string, unknown>[];
  return rows.map(parseScryfallRow);
}
