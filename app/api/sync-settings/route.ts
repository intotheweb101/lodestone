import { NextRequest, NextResponse } from 'next/server';
import { runMigrations } from '@/lib/db/migrations';
import { getDb } from '@/lib/db/connection';
import { requireAdmin } from '@/lib/auth';

interface SyncSettings {
  auto_sync_enabled: number;
  sync_interval_hours: number;
  last_auto_sync_at: string | null;
}

export function GET(req: NextRequest) {
  runMigrations();
  try { requireAdmin(req); } catch (e: unknown) { const err = e as { message: string; status?: number }; return NextResponse.json({ error: err.message }, { status: err.status ?? 403 }); }
  const db = getDb();
  const row = db.prepare('SELECT auto_sync_enabled, sync_interval_hours, last_auto_sync_at FROM sync_settings WHERE id = 1').get() as SyncSettings;
  return NextResponse.json(row ?? { auto_sync_enabled: 0, sync_interval_hours: 24, last_auto_sync_at: null });
}

export async function POST(req: NextRequest) {
  runMigrations();
  try { requireAdmin(req); } catch (e: unknown) { const err = e as { message: string; status?: number }; return NextResponse.json({ error: err.message }, { status: err.status ?? 403 }); }
  const db = getDb();
  const { auto_sync_enabled, sync_interval_hours } = await req.json() as { auto_sync_enabled?: boolean; sync_interval_hours?: number };
  if (typeof auto_sync_enabled === 'boolean') {
    db.prepare('UPDATE sync_settings SET auto_sync_enabled = ? WHERE id = 1').run(auto_sync_enabled ? 1 : 0);
  }
  if (typeof sync_interval_hours === 'number' && sync_interval_hours > 0) {
    db.prepare('UPDATE sync_settings SET sync_interval_hours = ? WHERE id = 1').run(sync_interval_hours);
  }
  return NextResponse.json({ ok: true });
}
