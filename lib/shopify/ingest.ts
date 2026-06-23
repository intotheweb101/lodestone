/**
 * Shopify shop ingest — paginated, rate-limited, idempotent.
 * Writes to SQLite via upsert keyed on (shop_id, shopify_variant_id).
 */

import { getDb } from '../db/connection';
import type BetterSqlite3 from 'better-sqlite3';
import { getAllShops, updateShopSyncedAt, type Shop } from '../db/queries';
import { syncLog } from '../sync-log';
import type { ShopifyProduct, ShopifyProductsPage } from './types';
import { parseDialectAProduct } from './parsers/dialectA';
import { parseDialectBProduct } from './parsers/dialectB';
import type { ParsedProduct } from './parsers/dialectA';

const UA = 'mtg-deck-builder/1.0 (hadlee.lineham@macroactive.com; personal deck tool)';
const REQUEST_INTERVAL_MS = 1200; // ~1 req/s per shop — be polite
const MAX_PAGES = 200; // safety cap

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchPage(url: string): Promise<ShopifyProduct[]> {
  await sleep(REQUEST_INTERVAL_MS);

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(30000),
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '5', 10);
    console.warn(`[ingest] Rate-limited. Waiting ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return fetchPage(url);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  const data = await res.json() as ShopifyProductsPage;
  return data.products ?? [];
}

async function fetchAllProducts(baseUrl: string, collectionHandle: string): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  let page = 1;

  while (page <= MAX_PAGES) {
    const url = `${baseUrl}/collections/${collectionHandle}/products.json?limit=250&page=${page}`;
    console.log(`[ingest]   Fetching page ${page}: ${url}`);

    const products = await fetchPage(url);
    if (products.length === 0) break;

    all.push(...products);
    page++;

    if (products.length < 250) break; // last page
  }

  return all;
}

// Prepared once per process (not per call) — captured on first upsertParsedProduct call
let _historyInsert: BetterSqlite3.Statement | null = null;

function upsertParsedProduct(db: ReturnType<typeof getDb>, shopId: number, parsed: ParsedProduct): { products: number; variants: number; matched: number } {
  if (!_historyInsert) {
    _historyInsert = db.prepare(`
      INSERT OR IGNORE INTO price_history (match_key, shop_id, finish, condition, price_nzd, available, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);
  }
  const historyInsert = _historyInsert;

  const upsertProduct = db.prepare(`
    INSERT INTO shop_products (
      shop_id, shopify_id, handle, title,
      card_name_norm, set_name_norm, set_code_norm, collector_norm,
      treatment_flags, product_url, raw_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'))
    ON CONFLICT(shop_id, shopify_id) DO UPDATE SET
      title = excluded.title,
      card_name_norm = excluded.card_name_norm,
      set_name_norm = excluded.set_name_norm,
      set_code_norm = excluded.set_code_norm,
      collector_norm = excluded.collector_norm,
      treatment_flags = excluded.treatment_flags,
      product_url = excluded.product_url,
      updated_at = datetime('now')
  `);

  const getProductId = db.prepare('SELECT id FROM shop_products WHERE shop_id = ? AND shopify_id = ?');

  const upsertVariant = db.prepare(`
    INSERT INTO shop_variants (
      product_id, shop_id, shopify_var_id,
      finish, condition, condition_rank,
      price_original, price_nzd, currency,
      available, sku, match_key, confidence, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(shop_id, shopify_var_id) DO UPDATE SET
      finish = excluded.finish,
      condition = excluded.condition,
      condition_rank = excluded.condition_rank,
      price_original = excluded.price_original,
      price_nzd = excluded.price_nzd,
      currency = excluded.currency,
      available = excluded.available,
      sku = excluded.sku,
      match_key = excluded.match_key,
      confidence = excluded.confidence,
      updated_at = datetime('now')
  `);

  let variantCount = 0;
  let matchedCount = 0;

  upsertProduct.run(
    shopId, parsed.shopify_id, parsed.handle, parsed.title,
    parsed.card_name_norm, parsed.set_name_norm, parsed.set_code_norm, parsed.collector_norm,
    JSON.stringify(parsed.treatment_flags), parsed.product_url,
  );

  const row = getProductId.get(shopId, parsed.shopify_id) as { id: number } | undefined;
  if (!row) return { products: 1, variants: 0, matched: 0 };

  for (const v of parsed.variants) {
    upsertVariant.run(
      row.id, shopId, v.shopify_var_id,
      v.finish, v.condition, v.condition_rank,
      v.price_original, v.price_nzd, v.currency,
      v.available ? 1 : 0,
      v.sku, v.match_key, v.confidence,
    );
    variantCount++;
    if (v.match_key && v.confidence !== 'none') {
      matchedCount++;
      // Capture a daily price snapshot for available, matched variants
      if (v.available) {
        historyInsert.run(v.match_key, shopId, v.finish, v.condition, v.price_nzd, 1);
      }
    }
  }

  return { products: 1, variants: variantCount, matched: matchedCount };
}

export async function ingestShop(shop: Shop): Promise<{ products: number; variants: number; matched: number; errors: string[] }> {
  const db = getDb();
  let totalProducts = 0;
  let totalVariants = 0;
  let totalMatched = 0;
  const errors: string[] = [];

  // Read AUD→NZD FX rate once from sync_settings (falls back to 1.10 if not set)
  const syncRow = db.prepare('SELECT aud_nzd_rate FROM sync_settings WHERE id = 1').get() as { aud_nzd_rate: number | null } | undefined;
  const audNzdRate = syncRow?.aud_nzd_rate ?? 1.10;
  const shopCurrency = shop.currency ?? 'NZD';

  syncLog(`Starting shop: ${shop.name} (${shop.base_url}) [Dialect ${shop.dialect}, currency=${shopCurrency}]`);

  const logInsert = db.prepare(`
    INSERT INTO ingest_log (shop_id, started_at) VALUES (?, datetime('now'))
  `);
  const logResult = logInsert.run(shop.id);
  const logId = logResult.lastInsertRowid;

  try {
    for (const handle of shop.collection_handles) {
      syncLog(`  Collection: ${handle}`);
      let products: ShopifyProduct[];
      try {
        products = await fetchAllProducts(shop.base_url, handle);
      } catch (err) {
        const msg = `Failed to fetch ${handle}: ${err instanceof Error ? err.message : String(err)}`;
        syncLog(`  ERROR: ${msg}`);
        errors.push(msg);
        continue;
      }

      syncLog(`  Got ${products.length} products. Parsing...`);

      const batchUpsert = db.transaction((batch: ShopifyProduct[]) => {
        let p = 0; let v = 0; let m = 0;
        for (const product of batch) {
          let parsed: ParsedProduct;
          try {
            if (shop.dialect === 'A') {
              parsed = parseDialectAProduct(product, shop.base_url, shopCurrency, audNzdRate);
            } else {
              parsed = parseDialectBProduct(product, shop.base_url, shopCurrency, audNzdRate);
            }
          } catch (err) {
            errors.push(`Parse error on ${product.handle}: ${err instanceof Error ? err.message : String(err)}`);
            continue;
          }
          const res = upsertParsedProduct(db, shop.id, parsed);
          p += res.products; v += res.variants; m += res.matched;
        }
        return { p, v, m };
      });

      // Process in batches of 100 for transaction efficiency
      for (let i = 0; i < products.length; i += 100) {
        const batch = products.slice(i, i + 100);
        const res = batchUpsert(batch);
        totalProducts += res.p;
        totalVariants += res.v;
        totalMatched += res.m;

        if ((i + 100) % 1000 < 100) {
          syncLog(`  Progress: ${totalProducts} products, ${totalVariants} variants, ${totalMatched} matched`);
        }
      }
    }

    db.prepare(`
      UPDATE ingest_log SET finished_at = datetime('now'), products = ?, variants = ?, matched = ?, errors = ?
      WHERE id = ?
    `).run(totalProducts, totalVariants, totalMatched, errors.length > 0 ? JSON.stringify(errors) : null, logId);

    updateShopSyncedAt(shop.id);
    syncLog(`${shop.name} done: ${totalProducts} products, ${totalVariants} variants, ${totalMatched} matched (${errors.length} errors)`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    db.prepare(`
      UPDATE ingest_log SET finished_at = datetime('now'), errors = ? WHERE id = ?
    `).run(JSON.stringify(errors), logId);
    console.error(`[ingest] Fatal error for ${shop.name}: ${msg}`);
  }

  return { products: totalProducts, variants: totalVariants, matched: totalMatched, errors };
}

export async function ingestAllShops(): Promise<void> {
  const shops = getAllShops();
  for (const shop of shops) {
    await ingestShop(shop);
  }
  console.log('\n[ingest] All shops complete.');
}
