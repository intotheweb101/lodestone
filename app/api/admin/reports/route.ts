import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { runMigrations } from '@/lib/db/migrations';
import { getOpenReports, resolveReport } from '@/lib/social/store';

export function GET(req: NextRequest) {
  runMigrations();
  try { requireAdmin(req); } catch (e: unknown) {
    const err = e as { message: string; status?: number };
    return NextResponse.json({ error: err.message }, { status: err.status ?? 403 });
  }
  return NextResponse.json({ reports: getOpenReports(100) });
}

const PatchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['resolved', 'dismissed']),
});

export async function PATCH(req: NextRequest) {
  runMigrations();
  try { requireAdmin(req); } catch (e: unknown) {
    const err = e as { message: string; status?: number };
    return NextResponse.json({ error: err.message }, { status: err.status ?? 403 });
  }
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  resolveReport(parsed.data.id, parsed.data.status);
  return NextResponse.json({ ok: true });
}
