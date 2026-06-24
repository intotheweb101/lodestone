import { NextRequest, NextResponse } from 'next/server';
import { getDeck } from '@/lib/deck/store';
import { getRecommendations } from '@/lib/recommend/engine';
import { runMigrations } from '@/lib/db/migrations';
import { getCurrentUser } from '@/lib/auth/session';
import { canView } from '@/lib/auth/access';

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

  const result = await getRecommendations(deck);
  return NextResponse.json(result);
}
