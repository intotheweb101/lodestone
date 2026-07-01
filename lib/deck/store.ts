/**
 * Deck persistence — read/write from SQLite.
 */

import { getDb } from '../db/connection';
import type { Deck, DeckEntry } from './model';
import { classifyCard } from '../recommend/classify';
import { randomUUID } from 'crypto';

function rowToDeckEntry(row: Record<string, unknown>): DeckEntry {
  return {
    oracle_id: row.oracle_id as string,
    scryfall_id: row.scryfall_id as string | null,
    card_name: row.card_name as string,
    quantity: row.quantity as number,
    is_commander: Boolean(row.is_commander),
    treatment: (row.treatment as string ?? 'normal') as DeckEntry['treatment'],
    finish: (row.finish as string ?? 'nonfoil') as DeckEntry['finish'],
    condition_floor: (row.condition_floor as string ?? 'lp') as DeckEntry['condition_floor'],
    board: ((row.board as string) ?? 'main') as DeckEntry['board'],
    custom_price: (row.custom_price as number | null) ?? null,
    category: (row.category as DeckEntry['category']) ?? null,
    commander_role: (row.commander_role as DeckEntry['commander_role']) ?? null,
  };
}

export function getDeck(id: string): Deck | null {
  const db = getDb();
  const deck = db.prepare('SELECT * FROM decks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!deck) return null;

  const entries = db.prepare('SELECT * FROM deck_entries WHERE deck_id = ? ORDER BY is_commander DESC, card_name ASC').all(id) as Record<string, unknown>[];

  const tagRows = db.prepare('SELECT tag FROM deck_tags WHERE deck_id = ? ORDER BY tag').all(id) as { tag: string }[];

  // Auto-classify any entries that have no stored category (e.g. pre-feature or imported decks).
  // The stored value is only used when the user has manually overridden it.
  const unclassified = entries.filter(e => !e.category && e.oracle_id);
  if (unclassified.length > 0) {
    const oracleIds = [...new Set(unclassified.map(e => e.oracle_id as string))];
    const placeholders = oracleIds.map(() => '?').join(',');
    const cardRows = db.prepare(
      `SELECT oracle_id, type_line, oracle_text FROM scryfall_cards WHERE oracle_id IN (${placeholders})`
    ).all(...oracleIds) as { oracle_id: string; type_line: string | null; oracle_text: string | null }[];
    const cardMap = new Map(cardRows.map(r => [r.oracle_id, r]));

    const update = db.prepare('UPDATE deck_entries SET category = ? WHERE deck_id = ? AND oracle_id = ? AND board = ? AND (category IS NULL OR category = \'\')');
    const classify = db.transaction(() => {
      for (const e of unclassified) {
        const card = cardMap.get(e.oracle_id as string);
        if (!card) continue;
        const category = classifyCard({ type_line: card.type_line, oracle_text: card.oracle_text, card_name: e.card_name as string });
        e.category = category;
        update.run(category, id, e.oracle_id, e.board ?? 'main');
      }
    });
    classify();
  }

  return {
    id: deck.id as string,
    name: deck.name as string,
    format: deck.format as Deck['format'],
    commander: deck.commander as string | null,
    entries: entries.map(rowToDeckEntry),
    custom_value: (deck.custom_value as number | null) ?? null,
    user_id: (deck.user_id as string | null) ?? null,
    visibility: (deck.visibility as Deck['visibility']) ?? 'private',
    public_slug: (deck.public_slug as string | null) ?? null,
    description: (deck.description as string | null) ?? null,
    created_at: deck.created_at as string,
    updated_at: deck.updated_at as string,
    tags: tagRows.map(r => r.tag),
  };
}

/** Look up a deck by its public share slug (for /d/[slug] pages). */
export function getDeckBySlug(slug: string): Deck | null {
  const db = getDb();
  const row = db.prepare("SELECT id FROM decks WHERE public_slug = ?").get(slug) as { id: string } | undefined;
  if (!row) return null;
  return getDeck(row.id);
}

export interface DeckListRow {
  id: string;
  name: string;
  format: string;
  commander: string | null;
  card_count: number;
  updated_at: string;
  user_id: string | null;
  visibility: string;
  public_slug: string | null;
  like_count: number;
  folder_id: string | null;
}

/**
 * List decks for a user. When userId is provided, returns both that user's decks
 * AND legacy 'local' sentinel decks (created before the auth system existed).
 * Pass no argument to get all decks (admin / local dev mode).
 */
export function listDecks(userId?: string): DeckListRow[] {
  const db = getDb();
  // Authenticated: own decks + legacy local decks. Unauthenticated: local/NULL only — never leak other users' decks.
  const where = userId && userId !== 'local'
    ? `WHERE (d.user_id = ? OR d.user_id = 'local' OR d.user_id IS NULL)`
    : `WHERE (d.user_id = 'local' OR d.user_id IS NULL)`;
  const params = userId && userId !== 'local' ? [userId] : [];
  return db.prepare(`
    SELECT d.id, d.name, d.format, d.commander, d.updated_at,
           d.user_id, d.visibility, d.public_slug, d.folder_id,
           COALESCE(SUM(e.quantity), 0) as card_count,
           (SELECT COUNT(*) FROM deck_likes l WHERE l.deck_id = d.id) as like_count
    FROM decks d
    LEFT JOIN deck_entries e ON e.deck_id = d.id
    ${where}
    GROUP BY d.id
    ORDER BY d.updated_at DESC
  `).all(...params) as DeckListRow[];
}

/** List all public decks for the browse page. */
export function listPublicDecks(limit = 50, offset = 0): DeckListRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT d.id, d.name, d.format, d.commander, d.updated_at,
           d.user_id, d.visibility, d.public_slug, d.folder_id,
           COALESCE(SUM(e.quantity), 0) as card_count,
           (SELECT COUNT(*) FROM deck_likes l WHERE l.deck_id = d.id) as like_count
    FROM decks d
    LEFT JOIN deck_entries e ON e.deck_id = d.id
    WHERE d.visibility = 'public'
    GROUP BY d.id
    ORDER BY like_count DESC, d.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as DeckListRow[];
}

export interface BrowseFilters {
  q?: string;
  format?: string;
  commander?: string;
  /** WUBRG color letters to filter by */
  colors?: string[];
  /** How to match colors: exact string, all colors present (subset), or any color present (any) */
  colorMatch?: 'exact' | 'subset' | 'any';
  sort?: 'likes' | 'recent';
  tag?: string;
}

/** Filtered public deck listing for the browse page. */
export function listPublicDecksFiltered(filters: BrowseFilters, limit = 48, offset = 0): DeckListRow[] {
  const db = getDb();
  const clauses: string[] = ["d.visibility = 'public'"];
  const params: unknown[] = [];

  if (filters.q) {
    clauses.push("(d.name LIKE ? OR d.commander LIKE ?)");
    params.push(`%${filters.q}%`, `%${filters.q}%`);
  }
  if (filters.format) {
    clauses.push("d.format = ?");
    params.push(filters.format);
  }
  if (filters.commander) {
    clauses.push("d.commander LIKE ?");
    params.push(`%${filters.commander}%`);
  }
  if (filters.tag) {
    clauses.push("EXISTS (SELECT 1 FROM deck_tags dt WHERE dt.deck_id = d.id AND dt.tag = ?)");
    params.push(filters.tag);
  }
  if (filters.colors && filters.colors.length > 0) {
    const colorMatch = filters.colorMatch ?? 'subset';
    if (colorMatch === 'exact') {
      // Sort input colors to WUBRG order before comparing
      const WUBRG = ['W', 'U', 'B', 'R', 'G'];
      const sorted = WUBRG.filter(c => filters.colors!.includes(c)).join('');
      clauses.push("d.color_identity = ?");
      params.push(sorted);
    } else if (colorMatch === 'subset') {
      // All selected colors must appear in the deck's color_identity
      for (const c of filters.colors) {
        clauses.push("d.color_identity LIKE ?");
        params.push(`%${c}%`);
      }
    } else {
      // 'any' — at least one of the selected colors must appear
      const orParts = filters.colors.map(() => "d.color_identity LIKE ?").join(' OR ');
      clauses.push(`(${orParts})`);
      for (const c of filters.colors) params.push(`%${c}%`);
    }
  }

  const orderBy = filters.sort === 'recent'
    ? "d.updated_at DESC"
    : "like_count DESC, d.updated_at DESC";

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  return db.prepare(`
    SELECT d.id, d.name, d.format, d.commander, d.updated_at,
           d.user_id, d.visibility, d.public_slug, d.folder_id,
           COALESCE(SUM(e.quantity), 0) as card_count,
           (SELECT COUNT(*) FROM deck_likes l WHERE l.deck_id = d.id) as like_count
    FROM decks d
    LEFT JOIN deck_entries e ON e.deck_id = d.id
    ${where}
    GROUP BY d.id
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as DeckListRow[];
}

const WUBRG_ORDER = ['W', 'U', 'B', 'R', 'G'];

/**
 * Recompute and persist the deck's color_identity from its current mainboard entries.
 * Call after any entry add/remove/update that might change color composition.
 */
export function recomputeDeckColorIdentity(deckId: string): void {
  const db = getDb();
  const rows = db.prepare(`
    SELECT sc.color_identity_json
    FROM deck_entries de
    JOIN scryfall_cards sc ON sc.oracle_id = de.oracle_id
    WHERE de.deck_id = ? AND (de.board = 'main' OR de.board IS NULL)
  `).all(deckId) as { color_identity_json: string }[];

  const colorSet = new Set<string>();
  for (const row of rows) {
    try { for (const c of JSON.parse(row.color_identity_json || '[]')) colorSet.add(c as string); } catch {}
  }
  const ci = WUBRG_ORDER.filter(c => colorSet.has(c)).join('') || null;
  db.prepare("UPDATE decks SET color_identity = ? WHERE id = ?").run(ci, deckId);
}

/** Assign or clear a deck's folder. */
export function setDeckFolder(deckId: string, folderId: string | null): void {
  getDb().prepare('UPDATE decks SET folder_id = ? WHERE id = ?').run(folderId, deckId);
}

export function createDeck(name: string, format: Deck['format'] = 'commander', commander: string | null = null, userId: string | null = null): Deck {
  const db = getDb();
  const id = randomUUID();
  db.prepare("INSERT INTO decks (id, name, format, commander, user_id) VALUES (?, ?, ?, ?, ?)").run(id, name, format, commander, userId ?? 'local');
  return { id, name, format, commander, entries: [], user_id: userId ?? 'local', visibility: 'private' };
}

export function updateDeckMeta(id: string, updates: Partial<Pick<Deck, 'name' | 'format' | 'commander' | 'custom_value' | 'visibility' | 'public_slug' | 'description'>>): void {
  const db = getDb();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (updates.name !== undefined) { sets.push('name = ?'); vals.push(updates.name); }
  if (updates.format !== undefined) { sets.push('format = ?'); vals.push(updates.format); }
  if (updates.commander !== undefined) { sets.push('commander = ?'); vals.push(updates.commander); }
  if ('custom_value' in updates) { sets.push('custom_value = ?'); vals.push(updates.custom_value ?? null); }
  if ('visibility' in updates) { sets.push('visibility = ?'); vals.push(updates.visibility ?? 'private'); }
  if ('public_slug' in updates) { sets.push('public_slug = ?'); vals.push(updates.public_slug ?? null); }
  if ('description' in updates) { sets.push('description = ?'); vals.push(updates.description ?? null); }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE decks SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
}

export function addOrUpdateEntry(deckId: string, entry: DeckEntry): void {
  const db = getDb();
  const board = entry.board ?? 'main';
  db.prepare(`
    INSERT INTO deck_entries (deck_id, oracle_id, scryfall_id, card_name, quantity, is_commander, treatment, finish, condition_floor, custom_price, board, category, commander_role)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(deck_id, oracle_id, board) DO UPDATE SET
      scryfall_id = excluded.scryfall_id,
      card_name = excluded.card_name,
      quantity = excluded.quantity,
      is_commander = excluded.is_commander,
      treatment = excluded.treatment,
      finish = excluded.finish,
      condition_floor = excluded.condition_floor,
      custom_price = excluded.custom_price,
      category = COALESCE(deck_entries.category, excluded.category),
      commander_role = excluded.commander_role
  `).run(
    deckId, entry.oracle_id, entry.scryfall_id ?? null, entry.card_name,
    entry.quantity, entry.is_commander ? 1 : 0, entry.treatment, entry.finish,
    entry.condition_floor, entry.custom_price ?? null, board,
    entry.category ?? null, entry.commander_role ?? null,
  );

  db.prepare("UPDATE decks SET updated_at = datetime('now') WHERE id = ?").run(deckId);
}

export function removeEntry(deckId: string, oracleId: string, board?: string): void {
  const db = getDb();
  if (board) {
    db.prepare('DELETE FROM deck_entries WHERE deck_id = ? AND oracle_id = ? AND board = ?').run(deckId, oracleId, board);
  } else {
    db.prepare('DELETE FROM deck_entries WHERE deck_id = ? AND oracle_id = ?').run(deckId, oracleId);
  }
  db.prepare("UPDATE decks SET updated_at = datetime('now') WHERE id = ?").run(deckId);
}

export function cloneDeck(deckId: string, newName: string, userId: string | null): Deck | null {
  const source = getDeck(deckId);
  if (!source) return null;
  const db = getDb();
  const newId = randomUUID();
  db.transaction(() => {
    db.prepare("INSERT INTO decks (id, name, format, commander, user_id) VALUES (?, ?, ?, ?, ?)").run(
      newId, newName, source.format, source.commander, userId ?? 'local'
    );
    const stmt = db.prepare(`
      INSERT INTO deck_entries (deck_id, oracle_id, scryfall_id, card_name, quantity, is_commander, treatment, finish, condition_floor, custom_price, board, category, commander_role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const e of source.entries) {
      stmt.run(newId, e.oracle_id, e.scryfall_id, e.card_name, e.quantity, e.is_commander ? 1 : 0, e.treatment, e.finish, e.condition_floor, e.custom_price ?? null, e.board ?? 'main', e.category ?? null, e.commander_role ?? null);
    }
    if (source.tags && source.tags.length > 0) {
      const tagStmt = db.prepare("INSERT INTO deck_tags (deck_id, tag) VALUES (?, ?)");
      for (const tag of source.tags) tagStmt.run(newId, tag);
    }
  })();
  return getDeck(newId);
}

export function deleteDeck(id: string): void {
  getDb().prepare('DELETE FROM decks WHERE id = ?').run(id);
}

export function setDeckTags(deckId: string, tags: string[]): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM deck_tags WHERE deck_id = ?').run(deckId);
    const stmt = db.prepare('INSERT INTO deck_tags (deck_id, tag) VALUES (?, ?)');
    for (const tag of tags) {
      const clean = tag.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (clean) stmt.run(deckId, clean);
    }
  })();
}

export function setEntryCategory(deckId: string, oracleId: string, board: string, category: string | null): void {
  getDb().prepare(
    'UPDATE deck_entries SET category = ? WHERE deck_id = ? AND oracle_id = ? AND board = ?'
  ).run(category, deckId, oracleId, board);
}

export function setCommanderRole(deckId: string, oracleId: string, board: string, role: string | null): void {
  const db = getDb();
  const isInCommandZone = role !== null && role !== 'companion';
  db.prepare(
    'UPDATE deck_entries SET commander_role = ?, is_commander = ? WHERE deck_id = ? AND oracle_id = ? AND board = ?'
  ).run(role, isInCommandZone ? 1 : 0, deckId, oracleId, board);
}

// ─── Social: likes ────────────────────────────────────────────────────────────

export function toggleLike(userId: string, deckId: string): { liked: boolean } {
  const db = getDb();
  const existing = db.prepare('SELECT 1 FROM deck_likes WHERE user_id = ? AND deck_id = ?').get(userId, deckId);
  if (existing) {
    db.prepare('DELETE FROM deck_likes WHERE user_id = ? AND deck_id = ?').run(userId, deckId);
    return { liked: false };
  } else {
    db.prepare("INSERT INTO deck_likes (user_id, deck_id) VALUES (?, ?)").run(userId, deckId);
    return { liked: true };
  }
}

export function getLikeCount(deckId: string): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as n FROM deck_likes WHERE deck_id = ?').get(deckId) as { n: number };
  return row.n;
}

export function getUserLiked(userId: string, deckId: string): boolean {
  const db = getDb();
  return Boolean(db.prepare('SELECT 1 FROM deck_likes WHERE user_id = ? AND deck_id = ?').get(userId, deckId));
}

// ─── Social: comments ────────────────────────────────────────────────────────

export interface DeckComment {
  id: string;
  deck_id: string;
  user_id: string;
  user_name: string;
  body: string;
  parent_id: string | null;
  created_at: string;
}

export function getComments(deckId: string): DeckComment[] {
  const db = getDb();
  return db.prepare(`
    SELECT c.id, c.deck_id, c.user_id, u.name as user_name, c.body, c.parent_id, c.created_at
    FROM deck_comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.deck_id = ?
    ORDER BY c.created_at ASC
  `).all(deckId) as DeckComment[];
}

export function addComment(opts: { id: string; deckId: string; userId: string; body: string; parentId?: string | null }): DeckComment {
  const db = getDb();
  db.prepare("INSERT INTO deck_comments (id, deck_id, user_id, body, parent_id) VALUES (?, ?, ?, ?, ?)").run(
    opts.id, opts.deckId, opts.userId, opts.body.trim(), opts.parentId ?? null,
  );
  const row = db.prepare(`
    SELECT c.id, c.deck_id, c.user_id, u.name as user_name, c.body, c.parent_id, c.created_at
    FROM deck_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(opts.id) as DeckComment;
  return row;
}

export function deleteComment(commentId: string): void {
  getDb().prepare('DELETE FROM deck_comments WHERE id = ?').run(commentId);
}

export function editComment(commentId: string, body: string): void {
  getDb().prepare('UPDATE deck_comments SET body = ? WHERE id = ?').run(body.trim(), commentId);
}

/** Return the raw comment row (used for authorization checks). */
export function getComment(commentId: string): { id: string; deck_id: string; user_id: string; body: string } | null {
  return getDb().prepare('SELECT id, deck_id, user_id, body FROM deck_comments WHERE id = ?').get(commentId) as { id: string; deck_id: string; user_id: string; body: string } | null;
}

// ─── Social: folders ─────────────────────────────────────────────────────────

export interface DeckFolder {
  id: string;
  user_id: string;
  name: string;
  sort: number;
  created_at: string;
}

export function getFolders(userId: string): DeckFolder[] {
  const db = getDb();
  return db.prepare('SELECT * FROM deck_folders WHERE user_id = ? ORDER BY sort ASC, name ASC').all(userId) as DeckFolder[];
}

export function createFolder(id: string, userId: string, name: string): DeckFolder {
  const db = getDb();
  const maxSort = (db.prepare('SELECT COALESCE(MAX(sort), 0) as m FROM deck_folders WHERE user_id = ?').get(userId) as { m: number }).m;
  db.prepare("INSERT INTO deck_folders (id, user_id, name, sort) VALUES (?, ?, ?, ?)").run(id, userId, name.trim(), maxSort + 1);
  return { id, user_id: userId, name: name.trim(), sort: maxSort + 1, created_at: new Date().toISOString() };
}

export function deleteFolder(id: string, userId: string): void {
  getDb().prepare('DELETE FROM deck_folders WHERE id = ? AND user_id = ?').run(id, userId);
}

// ─── Metagame / reverse-lookup queries (Phase 2A) ────────────────────────────

/** Public decks that contain a card (by oracle_id), ordered by likes then recency. */
export function getDecksUsingCard(oracleId: string, limit = 20): DeckListRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT d.id, d.name, d.format, d.commander, d.updated_at,
           d.user_id, d.visibility, d.public_slug, d.folder_id,
           COALESCE(SUM(e2.quantity), 0) as card_count,
           (SELECT COUNT(*) FROM deck_likes l WHERE l.deck_id = d.id) as like_count
    FROM decks d
    JOIN deck_entries e ON e.deck_id = d.id AND e.oracle_id = ?
    LEFT JOIN deck_entries e2 ON e2.deck_id = d.id
    WHERE d.visibility = 'public'
    GROUP BY d.id
    ORDER BY like_count DESC, d.updated_at DESC
    LIMIT ?
  `).all(oracleId, limit) as DeckListRow[];
}

export interface StapleRow {
  oracle_id: string;
  card_name: string;
  deck_count: number;
}

/**
 * Most-played cards across all public decks.
 * Optionally filtered to a specific format (e.g. 'commander').
 */
export function getTopStaples(format: string | null = null, limit = 50): StapleRow[] {
  const db = getDb();
  const formatClause = format ? 'AND d.format = ?' : '';
  const params: unknown[] = format ? [format, limit] : [limit];
  return db.prepare(`
    SELECT e.oracle_id, e.card_name, COUNT(DISTINCT d.id) as deck_count
    FROM deck_entries e
    JOIN decks d ON d.id = e.deck_id
    WHERE d.visibility = 'public' ${formatClause}
    GROUP BY e.oracle_id
    ORDER BY deck_count DESC
    LIMIT ?
  `).all(...params) as StapleRow[];
}

/** Most-liked and recently updated public decks for a "trending" feed. Optionally filtered to a format. */
export function getTrendingDecks(limit = 20, format: string | null = null): DeckListRow[] {
  const db = getDb();
  const formatClause = format ? 'AND d.format = ?' : '';
  const params: unknown[] = format ? [format, limit] : [limit];
  return db.prepare(`
    SELECT d.id, d.name, d.format, d.commander, d.updated_at,
           d.user_id, d.visibility, d.public_slug, d.folder_id,
           COALESCE(SUM(e.quantity), 0) as card_count,
           (SELECT COUNT(*) FROM deck_likes l WHERE l.deck_id = d.id) as like_count
    FROM decks d
    LEFT JOIN deck_entries e ON e.deck_id = d.id
    WHERE d.visibility = 'public' ${formatClause}
    GROUP BY d.id
    ORDER BY like_count DESC, d.updated_at DESC
    LIMIT ?
  `).all(...params) as DeckListRow[];
}

/**
 * Most-liked public decks within the last `sinceDays` days (for time-windowed leaderboards).
 */
export function getTrendingDecksSince(format: string | null = null, sinceDays = 30, limit = 10): DeckListRow[] {
  const db = getDb();
  const formatClause = format ? 'AND d.format = ?' : '';
  const params: unknown[] = format ? [sinceDays, format, limit] : [sinceDays, limit];
  return db.prepare(`
    SELECT d.id, d.name, d.format, d.commander, d.updated_at,
           d.user_id, d.visibility, d.public_slug, d.folder_id,
           COALESCE(SUM(e.quantity), 0) as card_count,
           COUNT(DISTINCT l.user_id) as like_count
    FROM decks d
    LEFT JOIN deck_entries e ON e.deck_id = d.id
    LEFT JOIN deck_likes l ON l.deck_id = d.id
      AND l.created_at >= datetime('now', '-' || ? || ' days')
    WHERE d.visibility = 'public' ${formatClause}
    GROUP BY d.id
    HAVING like_count > 0
    ORDER BY like_count DESC, d.updated_at DESC
    LIMIT ?
  `).all(...params) as DeckListRow[];
}

/**
 * Deterministic "deck of the day" — picks the top-liked public deck
 * whose id hashes to today's date. Falls back to the most-liked if
 * fewer than 7 public decks exist.
 */
export function getDeckOfTheDay(): DeckListRow | null {
  const db = getDb();
  // Use SQLite date('now') as a stable daily seed: sort by ABS(CAST(SUBSTR(id,1,8) AS HEX XOR date))
  // Simpler: pick the deck at position (day-of-year % count) sorted by like_count DESC
  const rows = db.prepare(`
    SELECT d.id, d.name, d.format, d.commander, d.updated_at,
           d.user_id, d.visibility, d.public_slug, d.folder_id,
           COALESCE(SUM(e.quantity), 0) as card_count,
           (SELECT COUNT(*) FROM deck_likes l WHERE l.deck_id = d.id) as like_count
    FROM decks d
    LEFT JOIN deck_entries e ON e.deck_id = d.id
    WHERE d.visibility = 'public'
    GROUP BY d.id
    HAVING like_count > 0
    ORDER BY like_count DESC
    LIMIT 30
  `).all() as DeckListRow[];
  if (!rows.length) return null;
  // Deterministic daily rotation: use day-of-year from the DB
  const dayRow = db.prepare(`SELECT CAST(strftime('%j', 'now') AS INTEGER) AS doy`).get() as { doy: number };
  return rows[dayRow.doy % rows.length];
}
