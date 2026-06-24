/**
 * POST /api/deck/price
 * Batch-price a whole deck.
 * Body: { deck_id: string } OR { cards: CardPriceRequest[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { priceDeck, type CardPriceRequest } from '@/lib/pricing/aggregator';
import { getDeck } from '@/lib/deck/store';
import { getScryfallCardById } from '@/lib/db/queries';
import { buildMatchKey } from '@/lib/match/normalize';
import { mainboardEntries } from '@/lib/deck/model';
import { getCurrentUser } from '@/lib/auth/session';
import { canView } from '@/lib/auth/access';

const CardSchema = z.object({
  entry_id: z.string(),
  card_name: z.string(),
  match_key: z.string().nullable(),
  finish: z.string(),
  condition_floor: z.string(),
});
const DeckPriceBodySchema = z.object({
  deck_id: z.string().optional(),
  cards: z.array(CardSchema).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = DeckPriceBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const body = parsed.data;

  let cards: CardPriceRequest[] = [];

  if (body.deck_id) {
    const deck = getDeck(body.deck_id);
    if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Gate: private decks must not leak their card list to non-owners
    const user = await getCurrentUser();
    if (!canView(deck, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    cards = mainboardEntries(deck).map(entry => {
      let match_key: string | null = null;

      if (entry.scryfall_id) {
        const sc = getScryfallCardById(entry.scryfall_id);
        if (sc) {
          const finish = entry.finish === 'etched' ? 'etched' : entry.finish === 'foil' ? 'foil' : 'nonfoil';
          match_key = buildMatchKey(sc.set_code, sc.collector_number, finish);
        }
      }

      return {
        entry_id: entry.oracle_id,
        card_name: entry.card_name,
        match_key,
        finish: entry.finish,
        condition_floor: entry.condition_floor,
      };
    });
  } else if (body.cards) {
    cards = body.cards;
  } else {
    return NextResponse.json({ error: 'deck_id or cards required' }, { status: 400 });
  }

  const result = await priceDeck(cards);
  return NextResponse.json(result);
}
