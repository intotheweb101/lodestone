/**
 * POST /api/admin/sync
 * Trigger a manual ingest/sync in development.
 * Query params:
 *   ?target=scryfall   — download + load Scryfall bulk data
 *   ?target=shops      — ingest all NZ Shopify shops
 *   ?target=all        — both
 *   ?shop_id=<n>       — ingest a single shop by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { runMigrations } from '@/lib/db/migrations';
import { requireAdmin } from '@/lib/auth';

export async function POST(req: NextRequest) {
  runMigrations();
  try { requireAdmin(req); } catch (e: unknown) { const err = e as { message: string; status?: number }; return NextResponse.json({ error: err.message }, { status: err.status ?? 403 }); }

  const target = req.nextUrl.searchParams.get('target') ?? 'all';
  const shopIdParam = req.nextUrl.searchParams.get('shop_id');

  const results: Record<string, unknown> = {};

  if (target === 'scryfall' || target === 'all') {
    try {
      const { loadSets, loadBulkCards } = await import('@/lib/scryfall/bulk');
      await loadSets();
      await loadBulkCards();
      results.scryfall = 'ok';
    } catch (err) {
      results.scryfall = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  if (target === 'shops' || target === 'all') {
    try {
      if (shopIdParam) {
        const { getAllShops } = await import('@/lib/db/queries');
        const { ingestShop } = await import('@/lib/shopify/ingest');
        const shops = getAllShops();
        const shop = shops.find(s => s.id === parseInt(shopIdParam, 10));
        if (!shop) return NextResponse.json({ error: `Shop ${shopIdParam} not found` }, { status: 404 });
        const res = await ingestShop(shop);
        results.shop = res;
      } else {
        const { ingestAllShops } = await import('@/lib/shopify/ingest');
        await ingestAllShops();
        results.shops = 'ok';
      }
    } catch (err) {
      results.shops = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json({ ok: true, results });
}
