/**
 * Tier B legality checker — DB-aware banlist/restriction enforcement.
 *
 * `isLegal()` in model.ts is the pure Tier A checker (structure, copy limits, deck size).
 * This module supplements it by reading the `legalities_json` column already synced
 * from Scryfall into `scryfall_cards` — no hardcoded banlist ever drifts.
 *
 * Call from server-only contexts (Server Components, API routes, server actions).
 * Do NOT import in client components.
 */

import { getDb } from '../db/connection';
import type { Deck } from './model';
import { mainboardEntries } from './model';

/** Map our DeckFormat values to Scryfall's legality object keys. */
const FORMAT_TO_SCRYFALL: Record<string, string> = {
  standard:  'standard',
  modern:    'modern',
  pioneer:   'pioneer',
  legacy:    'legacy',
  vintage:   'vintage',
  pauper:    'pauper',
  commander: 'commander',
};

export interface LegalityResult {
  legal: boolean;
  reasons: string[];
  /** Cards that are banned in this format */
  banned: string[];
  /** Cards that are not legal in this format (wrong set, etc.) */
  notLegal: string[];
  /** Cards that are restricted to 1 copy (Vintage) but appear in multiples */
  restricted: string[];
}

/**
 * Check deck legality against Scryfall banlist data.
 * Returns a detailed report; `legal === true` only when all checks pass.
 *
 * Callers should run the pure `isLegal()` check first for structural rules;
 * this function only handles card-level legality (banned / not_legal / restricted).
 */
export function checkLegalityWithCards(deck: Deck): LegalityResult {
  const scryfallFormat = FORMAT_TO_SCRYFALL[deck.format];
  if (!scryfallFormat) {
    return { legal: true, reasons: [], banned: [], notLegal: [], restricted: [] };
  }

  const mainboard = mainboardEntries(deck);
  if (mainboard.length === 0) {
    return { legal: true, reasons: [], banned: [], notLegal: [], restricted: [] };
  }

  const db = getDb();
  const oracleIds = [...new Set(mainboard.map(e => e.oracle_id))];
  const placeholders = oracleIds.map(() => '?').join(',');

  const rows = db.prepare(
    `SELECT oracle_id, name, legalities_json FROM scryfall_cards WHERE oracle_id IN (${placeholders})`
  ).all(...oracleIds) as { oracle_id: string; name: string; legalities_json: string | null }[];

  // Build map: oracle_id → { name, legality }
  const legalityMap = new Map<string, { name: string; status: string }>();
  for (const row of rows) {
    let status = 'not_found';
    if (row.legalities_json) {
      try {
        const legalities = JSON.parse(row.legalities_json) as Record<string, string>;
        status = legalities[scryfallFormat] ?? 'not_found';
      } catch {}
    }
    legalityMap.set(row.oracle_id, { name: row.name, status });
  }

  const banned: string[] = [];
  const notLegal: string[] = [];
  const restricted: string[] = [];

  for (const entry of mainboard) {
    const info = legalityMap.get(entry.oracle_id);
    if (!info) continue; // card not in our DB — skip silently

    if (info.status === 'banned') {
      banned.push(info.name);
    } else if (info.status === 'not_legal') {
      notLegal.push(info.name);
    } else if (info.status === 'restricted' && entry.quantity > 1) {
      // Restricted = max 1 copy (Vintage rules)
      restricted.push(`${info.name} (×${entry.quantity}, restricted to 1)`);
    }
  }

  const reasons: string[] = [];
  if (banned.length > 0) reasons.push(`Banned: ${banned.join(', ')}`);
  if (notLegal.length > 0) reasons.push(`Not legal in ${deck.format}: ${notLegal.join(', ')}`);
  if (restricted.length > 0) reasons.push(`Restricted (max 1 copy): ${restricted.join(', ')}`);

  return {
    legal: reasons.length === 0,
    reasons,
    banned,
    notLegal,
    restricted,
  };
}
