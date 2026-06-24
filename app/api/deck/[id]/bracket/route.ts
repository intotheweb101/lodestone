/**
 * GET /api/deck/[id]/bracket
 * Returns Commander Spellbook bracket estimate for a deck.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDeck } from '@/lib/deck/store';
import { getCurrentUser } from '@/lib/auth/session';
import { canView } from '@/lib/auth/access';
import { runMigrations } from '@/lib/db/migrations';
import { estimateBracket } from '@/lib/commander-spellbook/client';

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

  const commander = deck.entries.find(e => e.is_commander);
  const mainCards = deck.entries.filter(e => !e.is_commander).map(e => e.card_name);
  const commanderNames = commander ? [commander.card_name] : [];

  const result = await estimateBracket(mainCards, commanderNames);
  if (!result) return NextResponse.json({ error: 'Could not estimate bracket' }, { status: 503 });

  return NextResponse.json(result);
}
