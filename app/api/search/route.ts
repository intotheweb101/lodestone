/**
 * GET /api/search?q=<query>
 * Proxies Scryfall autocomplete + returns matching oracle IDs from local DB.
 */

import { NextRequest, NextResponse } from 'next/server';
import { autocomplete } from '@/lib/scryfall/client';
import { searchScryfallByName, searchScryfallAdvanced } from '@/lib/db/queries';
import { runMigrations } from '@/lib/db/migrations';

let migrated = false;

export async function GET(req: NextRequest) {
  if (!migrated) { runMigrations(); migrated = true; }

  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (!q || q.length < 2) {
    return NextResponse.json({ suggestions: [], cards: [] });
  }

  // If query has no operators, use the fast autocomplete-optimised name path.
  // If it has operators, route through the advanced engine (autocomplete still uses name suggestions).
  const hasOperators = /[: ]/.test(q) && /[a-z]:/i.test(q);
  const localCards = hasOperators
    ? searchScryfallAdvanced(q, { limit: 20 }).cards
    : searchScryfallByName(q, 20);

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
    })),
  });
}
