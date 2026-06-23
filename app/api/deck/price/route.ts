/**
 * POST /api/deck/price
 * Batch-price a whole deck.
 * Body: { deck_id: string } OR { cards: CardPriceRequest[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { priceDeck, type CardPriceRequest } from '@/lib/pricing/aggregator';
import { getDeck } from '@/lib/deck/store';
import { getScryfallCardById } from '@/lib/db/queries';
import { buildMatchKey } from '@/lib/match/normalize';
import { mainboardEntries } from '@/lib/deck/model';

export async function POST(req: NextRequest) {
  const body = await req.json() as { deck_id?: string; cards?: CardPriceRequest[] };

  let cards: CardPriceRequest[] = [];

  if (body.deck_id) {
    const deck = getDeck(body.deck_id);
    if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });

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
