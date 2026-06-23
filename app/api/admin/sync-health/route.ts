import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db/connection';

export async function GET(req: NextRequest) {
  try { requireAdmin(req); } catch (e: unknown) {
    const err = e as { status?: number; message: string };
    return NextResponse.json({ error: err.message }, { status: err.status ?? 403 });
  }

  const db = getDb();

  const shops = db.prepare('SELECT * FROM shops').all() as {
    id: number; name: string; base_url: string; dialect: string;
    region: string; last_synced_at: string | null; collection_handles: string; enabled: number;
  }[];

  const scryfall = db.prepare("SELECT COUNT(*) as c FROM scryfall_cards").get() as { c: number };
  const lastScryfall = db.prepare("SELECT updated_at FROM scryfall_cards ORDER BY updated_at DESC LIMIT 1").get() as { updated_at: string } | undefined;

  const shopHealth = shops.map(s => {
    const lastLog = db.prepare(
      'SELECT * FROM ingest_log WHERE shop_id = ? ORDER BY started_at DESC LIMIT 1'
    ).get(s.id) as {
      id: number; started_at: string; finished_at: string | null;
      products: number; variants: number; matched: number; errors: string | null;
    } | undefined;

    const variantCount = (db.prepare(
      'SELECT COUNT(*) as c FROM shop_variants WHERE shop_id = ?'
    ).get(s.id) as { c: number }).c;

    const availableCount = (db.prepare(
      'SELECT COUNT(*) as c FROM shop_variants WHERE shop_id = ? AND available = 1'
    ).get(s.id) as { c: number }).c;

    const errors: string[] = lastLog?.errors ? JSON.parse(lastLog.errors) : [];
    const inProgress = lastLog ? (lastLog.finished_at === null) : false;

    let healthStatus: 'ok' | 'empty' | 'error' | 'dead' | 'pending' = 'pending';
    if (inProgress) healthStatus = 'pending';
    else if (errors.length > 0) healthStatus = 'error';
    else if (variantCount === 0 && lastLog) healthStatus = 'empty';
    else if (variantCount > 0) healthStatus = 'ok';

    return {
      id: s.id,
      name: s.name,
      base_url: s.base_url,
      dialect: s.dialect,
      region: s.region,
      enabled: s.enabled,
      collection_handles: JSON.parse(s.collection_handles),
      last_synced_at: s.last_synced_at,
      last_log: lastLog ?? null,
      variant_count: variantCount,
      available_count: availableCount,
      match_rate: lastLog && lastLog.variants > 0 ? Math.round((lastLog.matched / lastLog.variants) * 100) : null,
      errors,
      in_progress: inProgress,
      health: healthStatus,
    };
  });

  return NextResponse.json({
    scryfall: {
      card_count: scryfall.c,
      last_updated: lastScryfall?.updated_at ?? null,
    },
    shops: shopHealth,
    total_variants: shopHealth.reduce((s, sh) => s + sh.variant_count, 0),
    total_available: shopHealth.reduce((s, sh) => s + sh.available_count, 0),
  });
}
