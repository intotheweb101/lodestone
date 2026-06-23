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
    // Scryfall sync is also long-running — run in background
    void (async () => {
      try {
        const { loadSets, loadBulkCards } = await import('@/lib/scryfall/bulk');
        await loadSets();
        await loadBulkCards();
        console.log('[sync] Scryfall complete');
      } catch (err) {
        console.error('[sync] Scryfall error:', err);
      }
    })();
    results.scryfall = 'started';
  }

  if (target === 'shops' || target === 'all') {
    if (shopIdParam) {
      // Single shop: run inline so we can return the result
      try {
        const { getAllShops } = await import('@/lib/db/queries');
        const { ingestShop } = await import('@/lib/shopify/ingest');
        const shops = getAllShops();
        const shop = shops.find(s => s.id === parseInt(shopIdParam, 10));
        if (!shop) return NextResponse.json({ error: `Shop ${shopIdParam} not found` }, { status: 404 });
        void ingestShop(shop);
        results.shop = 'started';
      } catch (err) {
        results.shop = { error: err instanceof Error ? err.message : String(err) };
      }
    } else {
      // All shops: fire and forget — too slow to await in an HTTP handler
      void (async () => {
        try {
          const { ingestAllShops } = await import('@/lib/shopify/ingest');
          await ingestAllShops();
          console.log('[sync] All shops complete');
        } catch (err) {
          console.error('[sync] Shops error:', err);
        }
      })();
      results.shops = 'started';
    }
  }

  return NextResponse.json({ ok: true, message: 'Sync started in background — check sync health for progress.', results });
}
