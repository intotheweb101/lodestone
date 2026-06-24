import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { getDeck } from '@/lib/deck/store';
import { getCollectionMap } from '@/lib/collection/store';
import { runMigrations } from '@/lib/db/migrations';
import { canView } from '@/lib/auth/access';

const LOCAL_USER_ID = 'local';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  runMigrations();
  const { id } = await params;
  const user = getUserFromRequest(req);
  const userId = user?.id ?? LOCAL_USER_ID;
  const deck = getDeck(id);
  if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canView(deck, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const collMap = getCollectionMap(userId);
  const owned: Record<string, { have: number; foil_have: number }> = {};
  for (const entry of deck.entries) {
    const nfKey = entry.oracle_id + ':0';
    const foilKey = entry.oracle_id + ':1';
    owned[entry.oracle_id] = {
      have: collMap.get(nfKey)?.quantity ?? 0,
      foil_have: collMap.get(foilKey)?.quantity ?? 0,
    };
  }
  return NextResponse.json({ owned });
}
