import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { getCollection, upsertCollectionEntry } from '@/lib/collection/store';
import { runMigrations } from '@/lib/db/migrations';

// Single-user dev tool: fall back to 'local' when no session cookie is present.
// This means the collection always works without requiring a login.
const LOCAL_USER_ID = 'local';

function resolveUserId(req: NextRequest): string {
  const user = getUserFromRequest(req);
  return user?.id ?? LOCAL_USER_ID;
}

export async function GET(req: NextRequest) {
  runMigrations();
  const userId = resolveUserId(req);
  return NextResponse.json({ collection: getCollection(userId) });
}

export async function POST(req: NextRequest) {
  runMigrations();
  const userId = resolveUserId(req);
  const { oracle_id, scryfall_id, quantity, foil, notes } = await req.json() as {
    oracle_id: string; scryfall_id?: string; quantity: number; foil?: boolean; notes?: string;
  };
  if (!oracle_id) return NextResponse.json({ error: 'Missing oracle_id' }, { status: 400 });
  upsertCollectionEntry(userId, oracle_id, { scryfall_id, quantity: quantity ?? 1, foil: foil ?? false, notes });
  return NextResponse.json({ ok: true });
}
