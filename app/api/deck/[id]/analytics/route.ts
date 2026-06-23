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
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!migrated) { runMigrations(); migrated = true; }
  const { id } = await params;

  const deck = getDeck(id);
  if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = getDb();

  // Enrich mainboard entries only — sideboard/maybeboard don't affect mana curve, colors, etc.
  const mainboard = mainboardEntries(deck);
  const enriched = mainboard.map(e => {
    const row = e.oracle_id
      ? db.prepare(
          'SELECT type_line, cmc, color_identity_json, rarity FROM scryfall_cards WHERE oracle_id = ? LIMIT 1'
        ).get(e.oracle_id) as { type_line: string | null; cmc: number | null; color_identity_json: string; rarity: string | null } | undefined
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

  return NextResponse.json({
    total_cards: totalCards,
    land_count: landCount,
    avg_cmc: Math.round(avgCmc * 100) / 100,
    cmc_histogram: cmcHistogram,
    color_counts: colorCounts,
    type_counts: typeCounts,
    rarity_counts: rarityCounts,
    mana_source_counts: manaSourceCounts,
    card_data: oracleCardData,
  });
}
