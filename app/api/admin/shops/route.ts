import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db/connection';
import { runMigrations } from '@/lib/db/migrations';

export function GET(req: NextRequest) {
  runMigrations();
  try { requireAdmin(req); } catch (e: unknown) { const err = e as { message: string; status?: number }; return NextResponse.json({ error: err.message }, { status: err.status ?? 403 }); }
  const db = getDb();
  const shops = db.prepare('SELECT * FROM shops ORDER BY region, name').all();
  return NextResponse.json({ shops });
}

export async function POST(req: NextRequest) {
  runMigrations();
  try { requireAdmin(req); } catch (e: unknown) { const err = e as { message: string; status?: number }; return NextResponse.json({ error: err.message }, { status: err.status ?? 403 }); }
  const db = getDb();
  const { name, url, dialect, region } = await req.json() as { name: string; url: string; dialect: string; region: string };
  if (!name || !url || !dialect || !region) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  db.prepare("INSERT INTO shops (name, base_url, dialect, collection_handles, region) VALUES (?, ?, ?, '[]', ?)").run(name, url, dialect, region);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  runMigrations();
  try { requireAdmin(req); } catch (e: unknown) { const err = e as { message: string; status?: number }; return NextResponse.json({ error: err.message }, { status: err.status ?? 403 }); }
  const db = getDb();
  const { id, enabled, collection_handles, shipping_flat, free_shipping_threshold } = await req.json() as {
    id: number; enabled?: number; collection_handles?: string[]; shipping_flat?: number; free_shipping_threshold?: number | null;
  };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (enabled !== undefined) db.prepare('UPDATE shops SET enabled = ? WHERE id = ?').run(enabled, id);
  if (collection_handles !== undefined) db.prepare('UPDATE shops SET collection_handles = ? WHERE id = ?').run(JSON.stringify(collection_handles), id);
  if (shipping_flat !== undefined) db.prepare('UPDATE shops SET shipping_flat = ? WHERE id = ?').run(shipping_flat, id);
  if (free_shipping_threshold !== undefined) db.prepare('UPDATE shops SET free_shipping_threshold = ? WHERE id = ?').run(free_shipping_threshold, id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  runMigrations();
  try { requireAdmin(req); } catch (e: unknown) { const err = e as { message: string; status?: number }; return NextResponse.json({ error: err.message }, { status: err.status ?? 403 }); }
  const db = getDb();
  const { id } = await req.json() as { id: number };
  db.prepare('DELETE FROM shops WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}
