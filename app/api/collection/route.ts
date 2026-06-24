import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserFromRequest } from '@/lib/auth';
import { getCollection, upsertCollectionEntry } from '@/lib/collection/store';
import { runMigrations } from '@/lib/db/migrations';

const CollectionPostSchema = z.object({
  oracle_id: z.string().min(1),
  scryfall_id: z.string().optional(),
  quantity: z.number().default(1),
  foil: z.boolean().optional(),
  notes: z.string().optional(),
});

// Dev convenience: fall back to 'local' when ALLOW_LOCAL_FALLBACK is not 'false'.
// In production, set ALLOW_LOCAL_FALLBACK=false in .env so only real sessions can write.
const LOCAL_USER_ID = 'local';
const devFallbackAllowed = process.env.ALLOW_LOCAL_FALLBACK !== 'false';

function resolveUserId(req: NextRequest): string | null {
  const user = getUserFromRequest(req);
  if (user?.id) return user.id;
  return devFallbackAllowed ? LOCAL_USER_ID : null;
}

export async function GET(req: NextRequest) {
  runMigrations();
  const userId = resolveUserId(req);
  if (!userId) return NextResponse.json({ collection: [] });
  return NextResponse.json({ collection: getCollection(userId) });
}

export async function POST(req: NextRequest) {
  runMigrations();
  const userId = resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const parsed = CollectionPostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const { oracle_id, scryfall_id, quantity, foil, notes } = parsed.data;
  upsertCollectionEntry(userId, oracle_id, { scryfall_id, quantity, foil: foil ?? false, notes });
  return NextResponse.json({ ok: true });
}
