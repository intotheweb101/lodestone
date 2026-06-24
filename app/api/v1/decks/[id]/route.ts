/**
 * GET /api/v1/decks/[id]
 * Returns a public or unlisted deck by internal ID.
 * Private decks are not accessible via the public API.
 */
import { NextRequest } from 'next/server';
import { getDeck } from '@/lib/deck/store';
import { runMigrations } from '@/lib/db/migrations';
import { checkApiAuth, apiOk, apiError } from '@/lib/api/v1';

let migrated = false;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!migrated) { runMigrations(); migrated = true; }

  const auth = await checkApiAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const deck = getDeck(id);
  if (!deck) return apiError('Deck not found', 404);

  const vis = deck.visibility ?? 'private';
  if (vis === 'private') return apiError('Deck not found', 404);

  return apiOk(deck, { visibility: vis });
}
