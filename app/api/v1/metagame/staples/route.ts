/**
 * GET /api/v1/metagame/staples?format=commander&limit=50
 * Returns most-played cards across public decks.
 */
import { NextRequest } from 'next/server';
import { getTopStaples } from '@/lib/deck/store';
import { runMigrations } from '@/lib/db/migrations';
import { checkApiAuth, apiOk, apiError } from '@/lib/api/v1';

let migrated = false;

export async function GET(
  req: NextRequest,
) {
  if (!migrated) { runMigrations(); migrated = true; }

  const auth = await checkApiAuth(req);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') ?? null;
  const limitRaw = parseInt(searchParams.get('limit') ?? '50', 10);
  const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 50 : limitRaw), 200);

  if (format !== null) {
    const VALID = ['commander', 'standard', 'modern', 'pioneer', 'legacy', 'pauper', 'vintage', 'explorer', 'historic'];
    if (!VALID.includes(format)) {
      return apiError(`Invalid format. Valid: ${VALID.join(', ')}`, 400);
    }
  }

  const staples = getTopStaples(format, limit);
  return apiOk(staples, { format, limit, count: staples.length });
}
