/**
 * Player statistics — aggregate queries across decks, collection, and game history.
 * All functions are synchronous (better-sqlite3).
 */
import { getDb } from '../db/connection';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ColorStat  { color: string; deckCount: number; pct: number }
export interface FormatStat { format: string; deckCount: number; winPct: number | null; games: number }
export interface CardStat   { oracle_id: string; card_name: string; deckCount: number; image_url: string | null }
export interface CommanderStat { card_name: string; oracle_id: string; uses: number; wins: number; games: number; image_url: string | null }
export interface ArchetypeStat { archetype: string; wins: number; losses: number; draws: number; games: number; winPct: number }
export interface GamesSummary  { total: number; wins: number; losses: number; draws: number; winPct: number | null; avgTurns: number | null }

export interface PlayerStats {
  // Deck library
  totalDecks: number;
  publicDecks: number;
  colors: ColorStat[];
  formats: FormatStat[];
  // Cards
  topCards: CardStat[];
  topCommanders: CommanderStat[];
  // Games
  games: GamesSummary;
  archetypes: ArchetypeStat[];
  // Collection
  collectionCards: number;
  collectionUnique: number;
  collectionFoils: number;
  collectionValueUsd: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractImageUrl(imageUrisJson: string | null, cardFacesJson: string | null): string | null {
  if (imageUrisJson) {
    try { return (JSON.parse(imageUrisJson) as Record<string, string>).normal ?? null; } catch { /* */ }
  }
  if (cardFacesJson) {
    try {
      const faces = JSON.parse(cardFacesJson) as { image_uris?: { normal?: string } }[];
      return faces[0]?.image_uris?.normal ?? null;
    } catch { /* */ }
  }
  return null;
}

const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G', 'C'];

// ─── Main query ───────────────────────────────────────────────────────────────

export function getPlayerStats(userId: string): PlayerStats {
  const db = getDb();

  // ── Deck counts ──
  const deckRows = db.prepare(`
    SELECT id, format, color_identity, visibility
    FROM decks WHERE user_id = ? AND deleted_at IS NULL
  `).all(userId) as { id: string; format: string | null; color_identity: string | null; visibility: string }[];

  const totalDecks = deckRows.length;
  const publicDecks = deckRows.filter(d => d.visibility === 'public').length;

  // ── Color distribution ──
  const colorMap = new Map<string, number>(); // color → deck count
  for (const d of deckRows) {
    const ci = (d.color_identity ?? '').split('').filter(c => 'WUBRG'.includes(c));
    if (ci.length === 0) {
      colorMap.set('C', (colorMap.get('C') ?? 0) + 1);
    } else {
      for (const c of ci) colorMap.set(c, (colorMap.get(c) ?? 0) + 1);
    }
  }
  const maxColor = Math.max(...colorMap.values(), 1);
  const colors: ColorStat[] = COLOR_ORDER
    .filter(c => colorMap.has(c))
    .map(c => ({ color: c, deckCount: colorMap.get(c)!, pct: Math.round((colorMap.get(c)! / maxColor) * 100) }))
    .sort((a, b) => b.deckCount - a.deckCount);

  // ── Format distribution + win rate ──
  const deckIdsByFormat = new Map<string, string[]>();
  for (const d of deckRows) {
    const f = d.format ?? 'other';
    if (!deckIdsByFormat.has(f)) deckIdsByFormat.set(f, []);
    deckIdsByFormat.get(f)!.push(d.id);
  }

  const formats: FormatStat[] = [];
  for (const [format, ids] of deckIdsByFormat) {
    const ph = ids.map(() => '?').join(',');
    const gRows = db.prepare(
      `SELECT result FROM deck_games WHERE deck_id IN (${ph}) AND user_id = ?`
    ).all(...ids, userId) as { result: string }[];
    const wins = gRows.filter(r => r.result === 'win').length;
    const games = gRows.length;
    formats.push({
      format,
      deckCount: ids.length,
      winPct: games > 0 ? Math.round((wins / games) * 100) : null,
      games,
    });
  }
  formats.sort((a, b) => b.deckCount - a.deckCount);

  // ── Top played cards (by deck count) ──
  const deckIds = deckRows.map(d => d.id);
  let topCards: CardStat[] = [];
  if (deckIds.length > 0) {
    const ph = deckIds.map(() => '?').join(',');
    const cardRows = db.prepare(`
      SELECT de.oracle_id, de.card_name, COUNT(DISTINCT de.deck_id) AS deckCount,
             sc.image_uris_json, sc.card_faces_json
      FROM deck_entries de
      LEFT JOIN scryfall_cards sc ON sc.oracle_id = de.oracle_id
      WHERE de.deck_id IN (${ph})
        AND de.is_commander = 0
        AND de.board = 'main'
        AND LOWER(de.card_name) NOT LIKE '%plains%'
        AND LOWER(de.card_name) NOT LIKE '%island%'
        AND LOWER(de.card_name) NOT LIKE '%swamp%'
        AND LOWER(de.card_name) NOT LIKE '%mountain%'
        AND LOWER(de.card_name) NOT LIKE '%forest%'
      GROUP BY de.oracle_id
      ORDER BY deckCount DESC
      LIMIT 12
    `).all(...deckIds) as { oracle_id: string; card_name: string; deckCount: number; image_uris_json: string | null; card_faces_json: string | null }[];
    topCards = cardRows.map(r => ({
      oracle_id: r.oracle_id,
      card_name: r.card_name,
      deckCount: r.deckCount,
      image_url: extractImageUrl(r.image_uris_json, r.card_faces_json),
    }));
  }

  // ── Top commanders ──
  let topCommanders: CommanderStat[] = [];
  if (deckIds.length > 0) {
    const ph = deckIds.map(() => '?').join(',');
    const cmdRows = db.prepare(`
      SELECT de.oracle_id, de.card_name, COUNT(DISTINCT de.deck_id) AS uses,
             sc.image_uris_json, sc.card_faces_json
      FROM deck_entries de
      LEFT JOIN scryfall_cards sc ON sc.oracle_id = de.oracle_id
      WHERE de.deck_id IN (${ph}) AND de.is_commander = 1
      GROUP BY de.oracle_id
      ORDER BY uses DESC
      LIMIT 6
    `).all(...deckIds) as { oracle_id: string; card_name: string; uses: number; image_uris_json: string | null; card_faces_json: string | null }[];

    topCommanders = cmdRows.map(r => {
      // Win/loss for decks using this commander
      const cmdDeckIds = deckRows
        .filter(d => db.prepare(
          'SELECT 1 FROM deck_entries WHERE deck_id = ? AND oracle_id = ? AND is_commander = 1 LIMIT 1'
        ).get(d.id, r.oracle_id))
        .map(d => d.id);
      let wins = 0, cmdGames = 0;
      if (cmdDeckIds.length > 0) {
        const gph = cmdDeckIds.map(() => '?').join(',');
        const gRows = db.prepare(
          `SELECT result FROM deck_games WHERE deck_id IN (${gph})`
        ).all(...cmdDeckIds) as { result: string }[];
        cmdGames = gRows.length;
        wins = gRows.filter(g => g.result === 'win').length;
      }
      return { card_name: r.card_name, oracle_id: r.oracle_id, uses: r.uses, wins, games: cmdGames, image_url: extractImageUrl(r.image_uris_json, r.card_faces_json) };
    });
  }

  // ── Overall game stats ──
  const allGames = db.prepare(
    `SELECT result, turns FROM deck_games WHERE user_id = ?`
  ).all(userId) as { result: string; turns: number | null }[];
  const wins = allGames.filter(g => g.result === 'win').length;
  const losses = allGames.filter(g => g.result === 'loss').length;
  const draws = allGames.filter(g => g.result === 'draw').length;
  const turnsArr = allGames.map(g => g.turns).filter((t): t is number => t != null);
  const games: GamesSummary = {
    total: allGames.length,
    wins, losses, draws,
    winPct: allGames.length > 0 ? Math.round((wins / allGames.length) * 100) : null,
    avgTurns: turnsArr.length > 0 ? Math.round(turnsArr.reduce((s, t) => s + t, 0) / turnsArr.length * 10) / 10 : null,
  };

  // ── Opponent archetypes ──
  const archRows = db.prepare(`
    SELECT opponent_archetype AS archetype,
           SUM(result = 'win') AS wins,
           SUM(result = 'loss') AS losses,
           SUM(result = 'draw') AS draws,
           COUNT(*) AS games
    FROM deck_games
    WHERE user_id = ? AND opponent_archetype IS NOT NULL AND opponent_archetype != ''
    GROUP BY opponent_archetype
    ORDER BY games DESC
    LIMIT 8
  `).all(userId) as { archetype: string; wins: number; losses: number; draws: number; games: number }[];
  const archetypes: ArchetypeStat[] = archRows.map(r => ({
    ...r,
    winPct: Math.round((r.wins / r.games) * 100),
  }));

  // ── Collection ──
  const collRows = db.prepare(
    `SELECT quantity, foil, price_usd FROM user_collection WHERE user_id = ?`
  ).all(userId) as { quantity: number; foil: number; price_usd: number | null }[];
  const collectionCards = collRows.reduce((s, r) => s + r.quantity, 0);
  const collectionUnique = collRows.length;
  const collectionFoils = collRows.filter(r => r.foil).reduce((s, r) => s + r.quantity, 0);
  const pricedRows = collRows.filter(r => r.price_usd != null);
  const collectionValueUsd = pricedRows.length > 0
    ? pricedRows.reduce((s, r) => s + r.price_usd! * r.quantity, 0)
    : null;

  return {
    totalDecks, publicDecks, colors, formats,
    topCards, topCommanders, games, archetypes,
    collectionCards, collectionUnique, collectionFoils, collectionValueUsd,
  };
}
