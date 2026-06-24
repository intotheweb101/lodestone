/**
 * GET /api/deck/[id]/analytics
 * Returns mana curve, color/type/rarity breakdowns, and stat counts for a deck.
 * Joins deck entries with scryfall_cards so the client doesn't need to.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDeck } from '@/lib/deck/store';
import { mainboardEntries } from '@/lib/deck/model';
import { getDb } from '@/lib/db/connection';
import { runMigrations } from '@/lib/db/migrations';
import { getProducedTokens, type CardRow } from '@/lib/deck/tokens';
import { classifyArchetype } from '@/lib/deck/archetype';
import { getDeckPriceHistory } from '@/lib/pricing/deck-history';
import { getCurrentUser } from '@/lib/auth/session';
import { canView } from '@/lib/auth/access';

let migrated = false;

const TYPE_BUCKETS = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land', 'Other'] as const;

function getTypeBucket(typeLine: string | null): string {
  if (!typeLine) return 'Other';
  for (const t of TYPE_BUCKETS) {
    if (typeLine.includes(t)) return t;
  }
  return 'Other';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!migrated) { runMigrations(); migrated = true; }
  const { id } = await params;

  const deck = getDeck(id);
  if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const user = await getCurrentUser();
  if (!canView(deck, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = getDb();

  // Enrich mainboard entries only — sideboard/maybeboard don't affect mana curve, colors, etc.
  const mainboard = mainboardEntries(deck);
  const enriched = mainboard.map(e => {
    const row = e.oracle_id
      ? db.prepare(
          'SELECT type_line, cmc, color_identity_json, rarity, mana_cost, oracle_text, card_faces_json FROM scryfall_cards WHERE oracle_id = ? LIMIT 1'
        ).get(e.oracle_id) as {
          type_line: string | null; cmc: number | null; color_identity_json: string;
          rarity: string | null; mana_cost: string | null;
          oracle_text: string | null; card_faces_json: string | null;
        } | undefined
      : undefined;

    let color_identity: string[] = [];
    try { color_identity = JSON.parse(row?.color_identity_json ?? '[]'); } catch { /* empty */ }

    return {
      card_name: e.card_name,
      quantity: e.quantity,
      is_commander: e.is_commander,
      cmc: row?.cmc ?? null,
      type_line: row?.type_line ?? null,
      color_identity,
      rarity: row?.rarity ?? null,
      mana_cost: row?.mana_cost ?? null,
      oracle_text: row?.oracle_text ?? null,
      card_faces_json: row?.card_faces_json ?? null,
    };
  });

  // ── Mana curve (lands excluded, matching engine.ts bucketing) ────────────────
  const cmcHistogram: Record<string, number> = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7+': 0 };
  let landCount = 0;
  let totalSpells = 0;
  let sumCmc = 0;

  for (const e of enriched) {
    if (e.is_commander) continue;
    const isLand = e.type_line?.includes('Land') ?? false;
    if (isLand) { landCount += e.quantity; continue; }
    const cmc = e.cmc ?? 0;
    const bucket = cmc >= 7 ? '7+' : String(Math.floor(cmc));
    cmcHistogram[bucket] = (cmcHistogram[bucket] ?? 0) + e.quantity;
    sumCmc += cmc * e.quantity;
    totalSpells += e.quantity;
  }
  const avgCmc = totalSpells > 0 ? sumCmc / totalSpells : 0;

  // ── Color breakdown ──────────────────────────────────────────────────────────
  const colorCounts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const e of enriched) {
    for (const c of e.color_identity) {
      if (c in colorCounts) colorCounts[c] += e.quantity;
    }
  }

  // ── Type breakdown ───────────────────────────────────────────────────────────
  const typeCounts: Record<string, number> = {};
  for (const e of enriched) {
    if (e.is_commander) continue;
    const bucket = getTypeBucket(e.type_line);
    typeCounts[bucket] = (typeCounts[bucket] ?? 0) + e.quantity;
  }

  // ── Rarity breakdown ────────────────────────────────────────────────────────
  const rarityCounts: Record<string, number> = { common: 0, uncommon: 0, rare: 0, mythic: 0, other: 0 };
  for (const e of enriched) {
    const r = e.rarity?.toLowerCase() ?? 'other';
    const key = r in rarityCounts ? r : 'other';
    rarityCounts[key] += e.quantity;
  }

  // ── Mana sources breakdown (lands by color they support) ─────────────────────
  // Approximation: use color_identity of land cards. Colorless lands counted separately.
  const manaSourceCounts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const e of enriched) {
    if (!e.type_line?.includes('Land')) continue;
    if (e.is_commander) continue;
    if (e.color_identity.length === 0) {
      manaSourceCounts['C'] += e.quantity;
    } else {
      for (const c of e.color_identity) {
        if (c in manaSourceCounts) manaSourceCounts[c] += e.quantity;
      }
    }
  }

  const totalCards = mainboard.reduce((s, e) => s + e.quantity, 0);

  // Per-card lookup map for client-side grouping (oracle_id → type_line + cmc)
  const oracleCardData: Record<string, { type_line: string | null; cmc: number | null }> = {};
  for (let i = 0; i < mainboard.length; i++) {
    const oracleId = mainboard[i].oracle_id;
    if (oracleId) oracleCardData[oracleId] = { type_line: enriched[i].type_line, cmc: enriched[i].cmc };
  }

  // ── Produced tokens (2C) ─────────────────────────────────────────────────────
  const tokenCardRows: CardRow[] = enriched.map(e => ({
    card_name: e.card_name,
    oracle_text: e.oracle_text,
    card_faces_json: e.card_faces_json,
  }));
  const { tokenMakers } = getProducedTokens(tokenCardRows);

  // ── Mana-base analyzer (2D) ──────────────────────────────────────────────────
  // Parse colored pips from mana_cost strings ({W}, {U}, {B}, {R}, {G}) to compute demand.
  const pipDemand: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const PIP_RE = /\{([WUBRG])\}/g;
  for (const e of enriched) {
    if (e.is_commander || e.type_line?.includes('Land')) continue;
    if (!e.mana_cost) continue;
    let m;
    PIP_RE.lastIndex = 0;
    while ((m = PIP_RE.exec(e.mana_cost)) !== null) {
      const c = m[1] as string;
      pipDemand[c] = (pipDemand[c] ?? 0) + e.quantity;
    }
  }

  const totalPips = Object.values(pipDemand).reduce((s, v) => s + v, 0);
  const totalLandSources = Object.values(manaSourceCounts).reduce((s, v) => s + v, 0);

  const manaWarnings: string[] = [];
  if (totalPips > 0 && totalLandSources > 0) {
    for (const color of ['W', 'U', 'B', 'R', 'G'] as const) {
      const demandShare = pipDemand[color] / totalPips;
      const sourceShare = manaSourceCounts[color] / totalLandSources;
      if (demandShare > 0.1 && sourceShare < demandShare - 0.15) {
        const colorNames: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
        manaWarnings.push(
          `Heavy ${colorNames[color]} demand (${Math.round(demandShare * 100)}% of pips) but only ${Math.round(sourceShare * 100)}% of land sources support it.`
        );
      }
    }
  }

  // Land-count advice (mirrors engine.ts heuristics for commander)
  const landAdvice: string[] = [];
  if (deck.format === 'commander') {
    if (landCount < 33) landAdvice.push(`${landCount} lands is too few for commander — most decks run 36–38.`);
    else if (landCount < 36) landAdvice.push(`${landCount} lands is on the low side — consider adding a few more.`);
    else if (landCount > 40) landAdvice.push(`${landCount} lands may be excessive — consider trimming 1–2.`);
  }

  // ── Archetype classification ──────────────────────────────────────────────────
  const archetypeResult = classifyArchetype(enriched.map(e => ({
    oracle_text: e.oracle_text,
    type_line: e.type_line,
    quantity: e.quantity,
    mana_cost: e.mana_cost,
    is_commander: e.is_commander,
  })));

  // ── Price history ─────────────────────────────────────────────────────────────
  const priceHistory = getDeckPriceHistory(deck.id, 90);

  return NextResponse.json({
    total_cards: totalCards,
    land_count: landCount,
    avg_cmc: Math.round(avgCmc * 100) / 100,
    cmc_histogram: cmcHistogram,
    color_counts: colorCounts,
    type_counts: typeCounts,
    rarity_counts: rarityCounts,
    mana_source_counts: manaSourceCounts,
    pip_demand: pipDemand,
    card_data: oracleCardData,
    token_makers: tokenMakers,
    mana_warnings: manaWarnings,
    land_advice: landAdvice,
    archetype: archetypeResult,
    price_history: priceHistory,
  });
}
