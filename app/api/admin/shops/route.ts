import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db/connection';
import { runMigrations } from '@/lib/db/migrations';

const ShopPostSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  dialect: z.string().min(1),
  region: z.string().min(1),
});
const ShopPatchSchema = z.object({
  id: z.number(),
  enabled: z.number().optional(),
  collection_handles: z.array(z.string()).optional(),
  shipping_flat: z.number().optional(),
  free_shipping_threshold: z.number().nullable().optional(),
});
const ShopDeleteSchema = z.object({ id: z.number() });

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
  const parsed = ShopPostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const { name, url, dialect, region } = parsed.data;
  const db = getDb();
  db.prepare("INSERT INTO shops (name, base_url, dialect, collection_handles, region) VALUES (?, ?, ?, '[]', ?)").run(name, url, dialect, region);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  runMigrations();
  try { requireAdmin(req); } catch (e: unknown) { const err = e as { message: string; status?: number }; return NextResponse.json({ error: err.message }, { status: err.status ?? 403 }); }
  const parsed = ShopPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const { id, enabled, collection_handles, shipping_flat, free_shipping_threshold } = parsed.data;
  const db = getDb();
  if (enabled !== undefined) db.prepare('UPDATE shops SET enabled = ? WHERE id = ?').run(enabled, id);
  if (collection_handles !== undefined) db.prepare('UPDATE shops SET collection_handles = ? WHERE id = ?').run(JSON.stringify(collection_handles), id);
  if (shipping_flat !== undefined) db.prepare('UPDATE shops SET shipping_flat = ? WHERE id = ?').run(shipping_flat, id);
  if (free_shipping_threshold !== undefined) db.prepare('UPDATE shops SET free_shipping_threshold = ? WHERE id = ?').run(free_shipping_threshold, id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  runMigrations();
  try { requireAdmin(req); } catch (e: unknown) { const err = e as { message: string; status?: number }; return NextResponse.json({ error: err.message }, { status: err.status ?? 403 }); }
  const parsed = ShopDeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const db = getDb();
  db.prepare('DELETE FROM shops WHERE id = ?').run(parsed.data.id);
  return NextResponse.json({ ok: true });
}
