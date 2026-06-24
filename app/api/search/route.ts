/**
 * GET /api/search?q=<query>
 * Proxies Scryfall autocomplete + returns matching oracle IDs from local DB.
 */

import { NextRequest, NextResponse } from 'next/server';
import { autocomplete } from '@/lib/scryfall/client';
import { searchScryfallByName, searchScryfallAdvanced } from '@/lib/db/queries';
import { runMigrations } from '@/lib/db/migrations';
import { getUserFromRequest } from '@/lib/auth';
import { getCollectionOracleIds } from '@/lib/collection/store';

let migrated = false;

export async function GET(req: NextRequest) {
  if (!migrated) { runMigrations(); migrated = true; }

  const q = req.nextUrl.searchParams.get('q') ?? '';
  const ownedOnly = req.nextUrl.searchParams.get('owned') === '1';

  if (!q || q.length < 2) {
    return NextResponse.json({ suggestions: [], cards: [] });
  }

  // Resolve the current user for collection-aware filtering/annotation
  const user = getUserFromRequest(req);
  const ownedIds: Set<string> = (user && user.id !== 'local')
    ? getCollectionOracleIds(user.id)
    : new Set();

  // If query has no operators, use the fast autocomplete-optimised name path.
  // If it has operators, route through the advanced engine (autocomplete still uses name suggestions).
  const hasOperators = /[: ]/.test(q) && /[a-z]:/i.test(q);
  let localCards = hasOperators
    ? searchScryfallAdvanced(q, { limit: 20 }).cards
    : searchScryfallByName(q, 20);

  // When &owned=1 and the user has a collection, restrict to cards they own
  if (ownedOnly && ownedIds.size > 0) {
    localCards = localCards.filter(c => ownedIds.has(c.oracle_id));
  }

  // Scryfall autocomplete for name suggestions (even before bulk sync)
  let scryfallNames: string[] = [];
  try {
    scryfallNames = await autocomplete(q);
  } catch {
    // Fall back to local only
  }

  return NextResponse.json({
    suggestions: scryfallNames.slice(0, 10),
    cards: localCards.map(c => ({
      scryfall_id: c.scryfall_id,
      oracle_id: c.oracle_id,
      name: c.name,
      set_code: c.set_code,
      collector_number: c.collector_number,
      image_url: c.image_uris?.normal ?? c.image_uris?.small ?? null,
      type_line: c.type_line,
      mana_cost: c.mana_cost,
      color_identity: c.color_identity ?? [],
      owned: ownedIds.has(c.oracle_id),
    })),
  });
}
