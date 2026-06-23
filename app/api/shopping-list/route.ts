/**
 * POST /api/shopping-list
 * Body: { source: 'wishlist' } | { source: 'deck-missing', deck_id: string }
 *
 * Assembles CardPriceRequest[] from the appropriate source and runs the
 * existing priceDeck() optimizer unchanged.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runMigrations } from '@/lib/db/migrations';
import { getCurrentUser } from '@/lib/auth/session';
import { priceDeck } from '@/lib/pricing/aggregator';
import { buildWishlistRequests, buildDeckMissingRequests } from '@/lib/pricing/shopping-list';

export async function POST(req: NextRequest) {
  runMigrations();
  const user = await getCurrentUser();
  if (!user || user.id === 'local') {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await req.json() as { source: string; deck_id?: string };

  let requests;
  if (body.source === 'wishlist') {
    requests = buildWishlistRequests(user.id);
  } else if (body.source === 'deck-missing' && body.deck_id) {
    requests = buildDeckMissingRequests(body.deck_id, user.id);
  } else {
    return NextResponse.json({ error: 'source must be "wishlist" or "deck-missing" (with deck_id)' }, { status: 400 });
  }

  if (requests.length === 0) {
    return NextResponse.json({
      card_results: [], best_per_card_total: 0,
      fewest_shops_basket: [], fewest_shops_total: 0, fewest_shops_count: 0,
      not_found_count: 0, as_of: new Date().toISOString(),
    });
  }

  const result = await priceDeck(requests);
  return NextResponse.json(result);
}
