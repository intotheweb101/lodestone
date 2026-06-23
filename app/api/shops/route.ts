import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/connection';
import { runMigrations } from '@/lib/db/migrations';

let migrated = false;

export function GET() {
  if (!migrated) { runMigrations(); migrated = true; }
  const rows = getDb()
    .prepare('SELECT id, name, base_url, region, last_synced_at FROM shops ORDER BY region, name')
    .all() as { id: number; name: string; base_url: string; region: string; last_synced_at: string | null }[];
  return NextResponse.json({ shops: rows, count: rows.length });
}
