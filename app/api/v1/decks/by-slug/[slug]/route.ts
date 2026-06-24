/**
 * GET /api/v1/decks/by-slug/[slug]
 * Returns a public or unlisted deck by its public slug.
 */
import { NextRequest } from 'next/server';
import { getDeckBySlug } from '@/lib/deck/store';
import { runMigrations } from '@/lib/db/migrations';
import { checkApiAuth, apiOk, apiError } from '@/lib/api/v1';

let migrated = false;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!migrated) { runMigrations(); migrated = true; }

  const auth = await checkApiAuth(req);
  if (!auth.ok) return auth.response;

  const { slug } = await params;
  const deck = getDeckBySlug(slug);
  if (!deck) return apiError('Deck not found', 404);

  const vis = deck.visibility ?? 'private';
  if (vis === 'private') return apiError('Deck not found', 404);

  return apiOk(deck, { visibility: vis });
}
