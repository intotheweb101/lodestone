import { NextRequest, NextResponse } from 'next/server';
import { getDeck } from '@/lib/deck/store';
import { runMigrations } from '@/lib/db/migrations';

let migrated = false;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!migrated) { runMigrations(); migrated = true; }
  const { id } = await params;
  const deck = getDeck(id);
  if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(deck);
}
