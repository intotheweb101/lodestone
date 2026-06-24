/**
 * GET /api/v1/cards/[oracleId]
 * Returns Scryfall card data for a given oracle ID.
 */
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db/connection';
import { runMigrations } from '@/lib/db/migrations';
import { checkApiAuth, apiOk, apiError } from '@/lib/api/v1';

let migrated = false;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ oracleId: string }> }
) {
  if (!migrated) { runMigrations(); migrated = true; }

  const auth = await checkApiAuth(req);
  if (!auth.ok) return auth.response;

  const { oracleId } = await params;
  const db = getDb();

  const card = db.prepare(`
    SELECT scryfall_id, oracle_id, name, mana_cost, type_line, oracle_text,
           set_code, collector_number, rarity, colors, color_identity,
           legalities_json, prices_json, image_uris_json, released_at
    FROM scryfall_cards
    WHERE oracle_id = ?
    ORDER BY released_at DESC
    LIMIT 1
  `).get(oracleId) as Record<string, unknown> | undefined;

  if (!card) return apiError('Card not found', 404);

  // Parse JSON fields
  const parsed = {
    ...card,
    legalities: card.legalities_json ? JSON.parse(card.legalities_json as string) : {},
    prices: card.prices_json ? JSON.parse(card.prices_json as string) : {},
    image_uris: card.image_uris_json ? JSON.parse(card.image_uris_json as string) : null,
    legalities_json: undefined,
    prices_json: undefined,
    image_uris_json: undefined,
  };

  return apiOk(parsed);
}
