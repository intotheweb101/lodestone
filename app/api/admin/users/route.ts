import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, deleteUser, hashPassword } from '@/lib/auth';
import { getDb } from '@/lib/db/connection';
import { runMigrations } from '@/lib/db/migrations';
import { randomBytes } from 'crypto';

const UserPatchSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['admin', 'user']).optional(),
  name: z.string().optional(),
  email: z.string().optional(),
});
const UserPutSchema = z.object({ id: z.string().min(1) });
const UserDeleteSchema = z.object({ id: z.string().min(1) });

export function GET(req: NextRequest) {
  runMigrations();
  try { requireAdmin(req); } catch (e: unknown) { const err = e as { message: string; status?: number }; return NextResponse.json({ error: err.message }, { status: err.status ?? 403 }); }
  const db = getDb();
  const users = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.avatar_url, u.created_at, u.username,
           COUNT(DISTINCT d.id) as deck_count,
           MAX(d.updated_at) as last_active
    FROM users u
    LEFT JOIN decks d ON d.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at ASC
  `).all();
  return NextResponse.json({ users });
}

export async function PATCH(req: NextRequest) {
  runMigrations();
  try { requireAdmin(req); } catch (e: unknown) { const err = e as { message: string; status?: number }; return NextResponse.json({ error: err.message }, { status: err.status ?? 403 }); }
  const parsed = UserPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const { id, role, name, email } = parsed.data;
  const db = getDb();
  if (role !== undefined) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  if (name?.trim()) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name.trim(), id);
  if (email?.trim()) db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email.trim().toLowerCase(), id);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  runMigrations();
  try { requireAdmin(req); } catch (e: unknown) { const err = e as { message: string; status?: number }; return NextResponse.json({ error: err.message }, { status: err.status ?? 403 }); }
  const parsed = UserPutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const { id } = parsed.data;
  const tempPassword = randomBytes(5).toString('hex');
  const hash = await hashPassword(tempPassword);
  getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
  return NextResponse.json({ tempPassword });
}

export async function DELETE(req: NextRequest) {
  runMigrations();
  const admin = (() => { try { return requireAdmin(req); } catch { return null; } })();
  if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 403 });
  const parsed = UserDeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const { id } = parsed.data;
  if (id === admin.id) return NextResponse.json({ error: 'Cannot delete your own account.' }, { status: 400 });
  deleteUser(id);
  return NextResponse.json({ ok: true });
}
