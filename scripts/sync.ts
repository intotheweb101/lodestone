#!/usr/bin/env tsx
/**
 * Data sync script — run manually or via cron.
 * Usage:
 *   npx tsx scripts/sync.ts              — sync everything
 *   npx tsx scripts/sync.ts scryfall     — Scryfall bulk only
 *   npx tsx scripts/sync.ts shops        — NZ shops only
 *   npx tsx scripts/sync.ts shop 1       — single shop by ID
 */

import { runMigrations } from '../lib/db/migrations';
import { loadSets, loadBulkCards } from '../lib/scryfall/bulk';
import { ingestAllShops, ingestShop } from '../lib/shopify/ingest';
import { getAllShops } from '../lib/db/queries';
import { loadSetAliasesFromDb } from '../lib/match/setAliases';

async function main() {
  const args = process.argv.slice(2);
  const target = args[0] ?? 'all';
  const shopId = args[1] ? parseInt(args[1], 10) : null;

  console.log('🃏 MTG Deck Builder — Data Sync');
  console.log(`Target: ${target}${shopId ? ` (shop ${shopId})` : ''}\n`);

  // Always run migrations first
  runMigrations();

  if (target === 'scryfall' || target === 'all') {
    console.log('--- Syncing Scryfall data ---');
    await loadSets();
    loadSetAliasesFromDb();
    await loadBulkCards();
    console.log('Scryfall sync complete.\n');
  }

  if (target === 'shops' || target === 'all') {
    console.log('--- Syncing NZ shops ---');
    loadSetAliasesFromDb();

    if (shopId) {
      const shops = getAllShops();
      const shop = shops.find(s => s.id === shopId);
      if (!shop) {
        console.error(`Shop ID ${shopId} not found. Available:`, shops.map(s => `${s.id}: ${s.name}`));
        process.exit(1);
      }
      await ingestShop(shop);
    } else {
      await ingestAllShops();
    }
    console.log('Shop sync complete.\n');
  }

  console.log('✅ Sync complete.');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
