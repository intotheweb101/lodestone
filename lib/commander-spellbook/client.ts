/**
 * Commander Spellbook integration — combo detection + bracket estimation.
 * APIs: https://backend.commanderspellbook.com/find-my-combos/
 *       https://backend.commanderspellbook.com/estimate-bracket/
 *
 * Both are cached in SQLite (TTL 24h) keyed by a sorted hash of submitted card names.
 */

import { getDb } from '../db/connection';
import { createHash } from 'crypto';
import { BRACKET_LABELS, type BracketCard, type BracketResult } from './labels';
export { BRACKET_LABELS } from './labels';
export type { BracketCard, BracketResult } from './labels';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComboCard {
  name: string;
  oracleId: string | null;
  image: string | null;
}

export interface ComboFeature {
  name: string;
}

export interface Combo {
  id: string;
  cards: ComboCard[];       // cards that participate in this combo
  missing: ComboCard[];     // cards from this combo NOT in the deck (for almostIncluded)
  produces: ComboFeature[]; // effects produced ("infinite mana", "win the game", etc.)
  description: string;
  bracketTag: string | null;
}

export interface ComboResult {
  included: Combo[];
  almostIncluded: Combo[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deckHash(cardNames: string[]): string {
  const sorted = [...cardNames].sort().join('|');
  return createHash('sha256').update(sorted).digest('hex').slice(0, 32);
}

function toApiCards(cardNames: string[]): { card: string }[] {
  return cardNames.map(n => ({ card: n }));
}

function parseComboCard(use: Record<string, unknown>): ComboCard {
  const card = (use.card ?? {}) as Record<string, unknown>;
  return {
    name: String(card.name ?? use.card ?? ''),
    oracleId: typeof card.oracleId === 'string' ? card.oracleId : null,
    image: (card.imageUriFrontPng ?? card.imageUriFrontSmall ?? null) as string | null,
  };
}

function parseFeatures(produces: unknown[]): ComboFeature[] {
  return (produces ?? []).slice(0, 5).map(p => {
    const pp = (p as Record<string, unknown>);
    const feat = pp.feature as Record<string, unknown> | undefined;
    return { name: String(feat?.name ?? pp.name ?? '') };
  }).filter(f => f.name);
}

function parseCombo(raw: Record<string, unknown>, deckCardNames: Set<string>): Combo {
  const uses = ((raw.uses ?? []) as unknown[]).map(u => parseComboCard(u as Record<string, unknown>));
  const missing = uses.filter(c => !deckCardNames.has(c.name));
  const produces = parseFeatures((raw.produces ?? []) as unknown[]);
  return {
    id: String(raw.id ?? ''),
    cards: uses,
    missing,
    produces,
    description: String(raw.description ?? '').slice(0, 300),
    bracketTag: typeof raw.bracketTag === 'string' ? raw.bracketTag : null,
  };
}

// ─── Find My Combos ──────────────────────────────────────────────────────────

export async function findCombos(cardNames: string[]): Promise<ComboResult> {
  if (cardNames.length === 0) return { included: [], almostIncluded: [] };

  const hash = deckHash(cardNames);
  const db = getDb();

  // Check cache (24h TTL)
  try {
    const cached = db.prepare(
      "SELECT result_json FROM combo_cache WHERE deck_hash = ? AND fetched_at > datetime('now', '-24 hours')"
    ).get(hash) as { result_json: string } | undefined;
    if (cached) return JSON.parse(cached.result_json) as ComboResult;
  } catch { /* table may not exist yet */ }

  // Fetch from Commander Spellbook
  try {
    const res = await fetch('https://backend.commanderspellbook.com/find-my-combos/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'lodestone-mtg/1.0 (hadlee.lineham@macroactive.com)',
      },
      body: JSON.stringify({ main: toApiCards(cardNames) }),
    });

    if (!res.ok) return { included: [], almostIncluded: [] };

    const data = await res.json() as { results?: Record<string, unknown> };
    const results = data.results ?? {};
    const deckNames = new Set(cardNames);

    const included = ((results.included ?? []) as unknown[])
      .map(c => parseCombo(c as Record<string, unknown>, deckNames));

    const almostIncluded = ((results.almostIncluded ?? []) as unknown[])
      .map(c => parseCombo(c as Record<string, unknown>, deckNames))
      .filter(c => c.missing.length <= 2) // only show combos 1-2 cards away
      .slice(0, 20);

    const result: ComboResult = { included, almostIncluded };

    // Cache the result
    try {
      db.prepare(`
        INSERT INTO combo_cache (deck_hash, result_json, fetched_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(deck_hash) DO UPDATE SET result_json = excluded.result_json, fetched_at = excluded.fetched_at
      `).run(hash, JSON.stringify(result));
    } catch { /* silently skip */ }

    return result;
  } catch {
    return { included: [], almostIncluded: [] };
  }
}

// ─── Estimate Bracket ─────────────────────────────────────────────────────────

export async function estimateBracket(
  mainCardNames: string[],
  commanderNames: string[] = [],
): Promise<BracketResult | null> {
  const allNames = [...mainCardNames, ...commanderNames];
  if (allNames.length === 0) return null;

  const hash = 'br:' + deckHash(allNames);
  const db = getDb();

  // Check cache (24h TTL)
  try {
    const cached = db.prepare(
      "SELECT result_json FROM bracket_cache WHERE deck_hash = ? AND fetched_at > datetime('now', '-24 hours')"
    ).get(hash) as { result_json: string } | undefined;
    if (cached) return JSON.parse(cached.result_json) as BracketResult;
  } catch { /* table may not exist yet */ }

  try {
    const body: Record<string, unknown> = { main: toApiCards(mainCardNames) };
    if (commanderNames.length > 0) body.commanders = toApiCards(commanderNames);

    const res = await fetch('https://backend.commanderspellbook.com/estimate-bracket/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'lodestone-mtg/1.0 (hadlee.lineham@macroactive.com)',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;

    const data = await res.json() as { bracketTag?: string; cards?: unknown[] };
    const tag = data.bracketTag ?? 'E';
    const info = BRACKET_LABELS[tag] ?? { num: 3, label: tag, color: '#8ba', desc: '' };

    const cards: BracketCard[] = ((data.cards ?? []) as unknown[]).map(raw => {
      const r = (raw as Record<string, unknown>);
      const card = (r.card ?? {}) as Record<string, unknown>;
      return {
        name: String(card.name ?? ''),
        oracleId: typeof card.oracleId === 'string' ? card.oracleId : null,
        image: (card.imageUriFrontSmall ?? null) as string | null,
        gameChanger: !!r.gameChanger,
        massLandDenial: !!r.massLandDenial,
        extraTurn: !!r.extraTurn,
        banned: !!r.banned,
      };
    });

    const reasons: string[] = [];
    const gcCount = cards.filter(c => c.gameChanger).length;
    const mldCount = cards.filter(c => c.massLandDenial).length;
    const etCount = cards.filter(c => c.extraTurn).length;
    const bannedCount = cards.filter(c => c.banned).length;
    if (gcCount > 0) reasons.push(`${gcCount} Game Changer${gcCount > 1 ? 's' : ''}`);
    if (mldCount > 0) reasons.push(`${mldCount} mass land denial card${mldCount > 1 ? 's' : ''}`);
    if (etCount > 0)  reasons.push(`${etCount} extra turn${etCount > 1 ? 's' : ''}`);
    if (bannedCount > 0) reasons.push(`${bannedCount} banned card${bannedCount > 1 ? 's' : ''}`);

    const result: BracketResult = {
      bracketTag: tag,
      bracketNum: info.num,
      bracketLabel: info.label,
      bracketColor: info.color,
      bracketDesc: info.desc,
      reasons,
      cards,
    };

    // Cache
    try {
      db.prepare(`
        INSERT INTO bracket_cache (deck_hash, result_json, fetched_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(deck_hash) DO UPDATE SET result_json = excluded.result_json, fetched_at = excluded.fetched_at
      `).run(hash, JSON.stringify(result));
    } catch { /* silently skip */ }

    return result;
  } catch {
    return null;
  }
}
