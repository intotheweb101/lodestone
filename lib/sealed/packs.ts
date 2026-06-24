/**
 * Sealed pack generation.
 * Standard booster: 1 rare/mythic + 3 uncommon + 10 common + 1 land/basic (omitted here).
 * Mythic rate: 1-in-8 rares (12.5%).
 */
import { getDb } from '../db/connection';

export interface SealedCard {
  scryfall_id: string;
  oracle_id: string;
  name: string;
  set_code: string;
  collector_number: string;
  rarity: string;
  mana_cost: string | null;
  type_line: string | null;
  oracle_text: string | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  cmc: number | null;
  color_identity: string[];
  colors: string[];
  image_url: string | null;
  image_uris_json: string | null;
  card_faces_json: string | null;
}

interface RawCard {
  scryfall_id: string;
  oracle_id: string;
  name: string;
  set_code: string;
  collector_number: string;
  rarity: string;
  mana_cost: string | null;
  type_line: string | null;
  oracle_text: string | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  cmc: number | null;
  color_identity_json: string | null;
  colors_json: string | null;
  image_uris_json: string | null;
  card_faces_json: string | null;
}

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

function parseColors(json: string | null): string[] {
  try { return json ? (JSON.parse(json) as string[]) : []; } catch { return []; }
}

function toSealedCard(row: RawCard): SealedCard {
  return {
    ...row,
    color_identity: parseColors(row.color_identity_json),
    colors: parseColors(row.colors_json),
    image_url: extractImageUrl(row.image_uris_json, row.card_faces_json),
  };
}

/** Fetch cards by rarity for a set, deduped by oracle_id. */
function getByRarity(setCode: string, rarity: string): SealedCard[] {
  const rows = getDb().prepare(`
    SELECT scryfall_id, oracle_id, name, set_code, collector_number, rarity,
           mana_cost, type_line, oracle_text, power, toughness, loyalty, cmc,
           color_identity_json, colors_json, image_uris_json, card_faces_json
    FROM scryfall_cards
    WHERE LOWER(set_code) = LOWER(?) AND rarity = ?
    GROUP BY oracle_id
    ORDER BY collector_number
  `).all(setCode, rarity) as RawCard[];
  return rows.map(toSealedCard);
}

/** Fisher-Yates shuffle (in-place). */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Pick n random elements from arr without replacement. */
function sample<T>(arr: T[], n: number): T[] {
  return shuffle([...arr]).slice(0, n);
}

export interface PackPool {
  setCode: string;
  setName: string;
  cards: SealedCard[];
  packCount: number;
  totalCommons: number;
  totalUncommons: number;
  totalRares: number;
  totalMythics: number;
}

/**
 * Generate a sealed pool: packCount standard boosters from setCode.
 * Each pack: 1 rare/mythic (1-in-8 mythic rate), 3 uncommons, 10 commons.
 * Sampling is with replacement across packs (real sealed can have duplicates).
 */
export function generateSealedPool(setCode: string, packCount = 6): PackPool | null {
  const db = getDb();
  const setRow = db.prepare('SELECT name FROM sets WHERE LOWER(code) = LOWER(?)').get(setCode) as { name: string } | undefined;
  if (!setRow) return null;

  const commons    = getByRarity(setCode, 'common');
  const uncommons  = getByRarity(setCode, 'uncommon');
  const rares      = getByRarity(setCode, 'rare');
  const mythics    = getByRarity(setCode, 'mythic');
  const rareSlot   = [...rares, ...rares, ...rares, ...rares, ...rares, ...rares, ...rares, ...mythics]; // 7:1 ratio

  // Need enough cards for meaningful packs
  if (commons.length < 5 || uncommons.length < 2) return null;

  const pool: SealedCard[] = [];
  let totalCommons = 0, totalUncommons = 0, totalRares = 0, totalMythics = 0;

  for (let p = 0; p < packCount; p++) {
    const commonPick   = sample(commons, Math.min(10, commons.length));
    const uncommonPick = sample(uncommons, Math.min(3, uncommons.length));
    const rarePick     = rareSlot.length > 0 ? sample(rareSlot, 1) : sample(uncommons, 1);

    pool.push(...commonPick, ...uncommonPick, ...rarePick);
    totalCommons    += commonPick.length;
    totalUncommons  += uncommonPick.length;
    const r = rarePick[0];
    if (r?.rarity === 'mythic') totalMythics++;
    else totalRares++;
  }

  return {
    setCode: setCode.toLowerCase(),
    setName: setRow.name,
    cards: pool,
    packCount,
    totalCommons,
    totalUncommons,
    totalRares,
    totalMythics,
  };
}

/** Sets that have enough cards in the local DB to generate meaningful sealed pools. */
export interface DraftableSet {
  code: string;
  name: string;
  released_at: string | null;
  set_type: string | null;
  commonCount: number;
  uncommonCount: number;
  rareCount: number;
}

export function listDraftableSets(): DraftableSet[] {
  const rows = getDb().prepare(`
    SELECT s.code, s.name, s.released_at, s.set_type,
           SUM(CASE WHEN c.rarity = 'common'   THEN 1 ELSE 0 END) AS commonCount,
           SUM(CASE WHEN c.rarity = 'uncommon' THEN 1 ELSE 0 END) AS uncommonCount,
           SUM(CASE WHEN c.rarity = 'rare'     THEN 1 ELSE 0 END) AS rareCount
    FROM sets s
    INNER JOIN scryfall_cards c ON LOWER(c.set_code) = LOWER(s.code)
    WHERE s.set_type IN ('expansion','core','draft_innovation','masters','funny')
    GROUP BY s.code
    HAVING commonCount >= 10 AND uncommonCount >= 4 AND rareCount >= 4
    ORDER BY s.released_at IS NULL ASC, s.released_at DESC
    LIMIT 80
  `).all() as DraftableSet[];
  return rows;
}
