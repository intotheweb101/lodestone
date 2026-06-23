/**
 * POST /api/price
 * Price a single card printing across NZ shops.
 * Body: { match_key: string, condition_floor?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPricesByMatchKey } from '@/lib/db/queries';
import { runMigrations } from '@/lib/db/migrations';

let migrated = false;

export async function POST(req: NextRequest) {
  if (!migrated) { runMigrations(); migrated = true; }

  const body = await req.json() as { match_key?: string; condition_floor?: string };
  const { match_key, condition_floor = 'lp' } = body;

  if (!match_key) {
    return NextResponse.json({ error: 'match_key required' }, { status: 400 });
  }

  const CONDITION_RANK: Record<string, number> = { nm: 0, lp: 1, mp: 2, hp: 3, dmg: 4 };
  const rankMax = CONDITION_RANK[condition_floor.toLowerCase()] ?? 1;

  // Fetch all variants (in-stock and out-of-stock) so we can show what's known
  const prices = getPricesByMatchKey(match_key, rankMax, false);

  // Deduplicate: one best price per shop (prefer in-stock)
  const seenShops = new Map<number, typeof prices[0]>();
  for (const p of prices) {
    const existing = seenShops.get(p.shop_id);
    if (!existing || (p.available && !existing.available)) {
      seenShops.set(p.shop_id, p);
    }
  }
  const bestPerShop = Array.from(seenShops.values())
    .sort((a, b) => {
      // In-stock first, then by price
      if (a.available !== b.available) return b.available - a.available;
      return a.price_nzd - b.price_nzd;
    });

  return NextResponse.json({
    match_key,
    prices: bestPerShop.map(p => ({
      shop_name: p.shop_name,
      shop_url: p.shop_base_url,
      product_url: p.product_url,
      price_nzd: p.price_nzd,
      condition: p.condition,
      finish: p.finish,
      confidence: p.confidence,
      available: Boolean(p.available),
    })),
    as_of: new Date().toISOString(),
  });
}
