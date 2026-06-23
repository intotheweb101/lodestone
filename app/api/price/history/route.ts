/**
 * GET /api/price/history?match_key=xxx[&days=90]
 * Returns daily price history for a card variant.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPriceHistory } from '@/lib/pricing/history';
import { runMigrations } from '@/lib/db/migrations';

let migrated = false;

export function GET(req: NextRequest) {
  if (!migrated) { runMigrations(); migrated = true; }

  const { searchParams } = new URL(req.url);
  const matchKey = searchParams.get('match_key');
  if (!matchKey) {
    return NextResponse.json({ error: 'match_key required' }, { status: 400 });
  }

  const days = Math.min(365, parseInt(searchParams.get('days') ?? '90', 10) || 90);
  const history = getPriceHistory(matchKey, days);

  return NextResponse.json(
    { match_key: matchKey, history, count: history.length },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } }
  );
}
