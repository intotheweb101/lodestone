/**
 * GET /api/deck/[id]/combos
 * Returns combos in the deck and combos you are 1-2 cards away from (via Commander Spellbook).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDeck } from '@/lib/deck/store';
import { getCurrentUser } from '@/lib/auth/session';
import { canView } from '@/lib/auth/access';
import { runMigrations } from '@/lib/db/migrations';
import { findCombos } from '@/lib/commander-spellbook/client';

let migrated = false;

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

  const cardNames = deck.entries.map(e => e.card_name);
  const result = await findCombos(cardNames);

  return NextResponse.json(result);
}
