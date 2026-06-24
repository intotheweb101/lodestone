/**
 * GET /api/deck/[id]/games
 * Returns game log entries and win-rate stats for a deck.
 * Read-gated by canView (public decks are readable by anyone).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDeck } from '@/lib/deck/store';
import { getCurrentUser } from '@/lib/auth/session';
import { canView } from '@/lib/auth/access';
import { runMigrations } from '@/lib/db/migrations';
import { getGames, getWinRate } from '@/lib/games/store';

let migrated = false;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!migrated) { runMigrations(); migrated = true; }
  const { id } = await params;

  const deck = getDeck(id);
  if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const user = await getCurrentUser();
  if (!canView(deck, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const games = getGames(id, 100);
  const stats = getWinRate(id);

  return NextResponse.json({ games, stats });
}
