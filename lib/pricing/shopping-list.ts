/**
 * Shopping-list request builders for the NZ price optimizer.
 *
 * These functions assemble CardPriceRequest[] arrays from a user's wishlist
 * or from the "cards missing for a deck" view, then pass them to the
 * existing priceDeck() optimizer unchanged.
 *
 * The match_key recipe here is the single source of truth — the deck price
 * route (app/api/deck/price/route.ts) now delegates to buildEntryRequest.
 */

import { getDb } from '../db/connection';
import { getScryfallCardById, getScryfallCardsByOracleId } from '../db/queries';
import { buildMatchKey } from '../match/normalize';
import { getWishlist } from '../wishlist/store';
import { getCollectionMap } from '../collection/store';
import { getDeck } from '../deck/store';
import { mainboardEntries } from '../deck/model';
import type { CardPriceRequest } from './aggregator';

/** Build a single CardPriceRequest from a scryfall_id + metadata. */
export function buildEntryRequest(opts: {
  entry_id: string;
  scryfall_id: string | null;
  oracle_id: string;
  card_name: string;
  finish: string;
  condition_floor: string;
}): CardPriceRequest {
  let match_key: string | null = null;
  if (opts.scryfall_id) {
    const sc = getScryfallCardById(opts.scryfall_id);
    if (sc) {
      const finish = opts.finish === 'foil' ? 'foil' : opts.finish === 'etched' ? 'etched' : 'nonfoil';
      match_key = buildMatchKey(sc.set_code, sc.collector_number, finish);
    }
  }
  if (!match_key) {
    // Fallback: pick the first printing for this oracle_id
    const printings = getScryfallCardsByOracleId(opts.oracle_id);
    if (printings.length > 0) {
      const finish = opts.finish === 'foil' ? 'foil' : opts.finish === 'etched' ? 'etched' : 'nonfoil';
      match_key = buildMatchKey(printings[0].set_code, printings[0].collector_number, finish);
    }
  }
  return {
    entry_id: opts.entry_id,
    card_name: opts.card_name,
    match_key,
    finish: opts.finish,
    condition_floor: opts.condition_floor,
  };
}

/**
 * Build price requests from a user's whole wishlist.
 * Honors quantity by emitting one request per copy with a suffixed entry_id.
 */
export function buildWishlistRequests(userId: string): CardPriceRequest[] {
  const items = getWishlist(userId);
  const requests: CardPriceRequest[] = [];
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      requests.push(buildEntryRequest({
        entry_id: `${item.oracle_id}:${item.finish}:${i}`,
        scryfall_id: item.scryfall_id,
        oracle_id: item.oracle_id,
        card_name: item.card_name,
        finish: item.finish,
        condition_floor: item.condition_floor,
      }));
    }
  }
  return requests;
}

/**
 * Build price requests for mainboard cards that the user doesn't already own.
 * "need = deck quantity − collection quantity"
 */
export function buildDeckMissingRequests(deckId: string, userId: string): CardPriceRequest[] {
  const deck = getDeck(deckId);
  if (!deck) return [];

  const collection = getCollectionMap(userId);
  const requests: CardPriceRequest[] = [];

  for (const entry of mainboardEntries(deck)) {
    const haveKey = entry.oracle_id + ':' + (entry.finish === 'foil' || entry.finish === 'etched' ? '1' : '0');
    const have = collection.get(haveKey)?.quantity ?? 0;
    const need = Math.max(0, entry.quantity - have);
    for (let i = 0; i < need; i++) {
      requests.push(buildEntryRequest({
        entry_id: `${entry.oracle_id}:${entry.finish}:${i}`,
        scryfall_id: entry.scryfall_id,
        oracle_id: entry.oracle_id,
        card_name: entry.card_name,
        finish: entry.finish,
        condition_floor: entry.condition_floor,
      }));
    }
  }
  return requests;
}

/** Fetch shops with their shipping info for display in the shopping list UI. */
export function getShopsWithShipping(): Record<number, { name: string; base_url: string; shipping_flat: number | null; free_threshold: number | null }> {
  const db = getDb();
  const rows = db.prepare('SELECT id, name, base_url, shipping_flat, free_shipping_threshold FROM shops WHERE enabled = 1').all() as {
    id: number; name: string; base_url: string; shipping_flat: number | null; free_shipping_threshold: number | null;
  }[];
  const map: Record<number, { name: string; base_url: string; shipping_flat: number | null; free_threshold: number | null }> = {};
  for (const r of rows) map[r.id] = { name: r.name, base_url: r.base_url, shipping_flat: r.shipping_flat, free_threshold: r.free_shipping_threshold };
  return map;
}
