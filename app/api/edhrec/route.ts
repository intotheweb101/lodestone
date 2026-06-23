import { NextRequest, NextResponse } from 'next/server';
import { getEdhrecData } from '@/lib/edhrec/client';
import { runMigrations } from '@/lib/db/migrations';

let migrated = false;

export async function GET(req: NextRequest) {
  if (!migrated) { runMigrations(); migrated = true; }
  const { searchParams } = new URL(req.url);
  const oracleId = searchParams.get('oracleId');
  const cardName = searchParams.get('cardName');
  if (!oracleId || !cardName) return NextResponse.json({ error: 'oracleId and cardName required' }, { status: 400 });

  const data = await getEdhrecData(oracleId, cardName);
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' },
  });
}
