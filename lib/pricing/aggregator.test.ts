import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the DB dependency before importing the module under test.
// vi.mock calls are hoisted automatically; the factory is evaluated at import time.
vi.mock('../db/queries', () => ({
  getPricesByMatchKeys: vi.fn().mockReturnValue([]),
}));

import { priceDeck, type CardPriceRequest } from './aggregator';
import { getPricesByMatchKeys } from '../db/queries';

const mockGetPrices = vi.mocked(getPricesByMatchKeys);

// ── helpers ───────────────────────────────────────────────────────────────────

function makeCard(id: string, matchKey: string | null, opts: { conditionFloor?: string } = {}): CardPriceRequest {
  return {
    entry_id: id,
    card_name: `Card ${id}`,
    match_key: matchKey,
    finish: 'nonfoil',
    condition_floor: opts.conditionFloor ?? 'nm',
  };
}

function makeVariant(matchKey: string, shopId: number, priceNzd: number, condRank = 0) {
  return {
    shop_id: shopId,
    shop_name: `Shop ${shopId}`,
    shop_base_url: `https://shop${shopId}.example.com`,
    product_id: shopId * 100,
    variant_id: shopId * 1000,
    finish: 'nonfoil',
    condition: 'Near Mint',
    condition_rank: condRank,
    price_nzd: priceNzd,
    price_original: null,
    currency: 'NZD',
    available: 1,
    sku: null,
    match_key: matchKey,
    confidence: 'exact',
    product_url: `https://shop${shopId}.example.com/product/${shopId}`,
    shop_currency: 'NZD',
  };
}

// ── basic results ─────────────────────────────────────────────────────────────

describe('priceDeck', () => {
  beforeEach(() => {
    mockGetPrices.mockReturnValue([]);
  });

  it('marks cards with no match_key as not_found', async () => {
    const result = await priceDeck([makeCard('a', null)]);
    expect(result.card_results).toHaveLength(1);
    expect(result.card_results[0].not_found).toBe(true);
    expect(result.card_results[0].best_price).toBeNull();
    expect(result.best_per_card_total).toBe(0);
  });

  it('marks cards with a match_key but no prices as not_found', async () => {
    mockGetPrices.mockReturnValue([]); // no prices returned
    const result = await priceDeck([makeCard('a', 'mh3::1::nonfoil')]);
    expect(result.card_results[0].not_found).toBe(true);
    expect(result.not_found_count).toBe(1);
  });

  it('populates best_price and all_prices for a found card', async () => {
    const mk = 'mh3::1::nonfoil';
    mockGetPrices.mockReturnValue([makeVariant(mk, 1, 5.0)]);
    const result = await priceDeck([makeCard('a', mk)]);
    const cr = result.card_results[0];
    expect(cr.not_found).toBe(false);
    expect(cr.best_price?.price_nzd).toBe(5.0);
    expect(cr.all_prices).toHaveLength(1);
  });

  it('picks the cheapest price as best_price when multiple shops carry the same card', async () => {
    const mk = 'mh3::1::nonfoil';
    mockGetPrices.mockReturnValue([
      makeVariant(mk, 1, 8.0),
      makeVariant(mk, 2, 5.0),
      makeVariant(mk, 3, 10.0),
    ]);
    const result = await priceDeck([makeCard('a', mk)]);
    expect(result.card_results[0].best_price?.price_nzd).toBe(5.0);
  });

  it('sums best prices for the best_per_card_total', async () => {
    const mk1 = 's1::1::nonfoil';
    const mk2 = 's2::2::nonfoil';
    mockGetPrices.mockReturnValue([
      makeVariant(mk1, 1, 3.0),
      makeVariant(mk2, 1, 7.0),
    ]);
    const result = await priceDeck([makeCard('a', mk1), makeCard('b', mk2)]);
    expect(result.best_per_card_total).toBeCloseTo(10.0, 2);
  });

  // ── condition floor filtering ─────────────────────────────────────────────

  it('filters out variants worse than the card condition_floor', async () => {
    const mk = 'mh3::1::nonfoil';
    mockGetPrices.mockReturnValue([
      makeVariant(mk, 1, 3.0, 0),  // NM — OK for NM floor
      makeVariant(mk, 2, 2.0, 1),  // LP — worse than NM floor; should be excluded
    ]);
    const result = await priceDeck([makeCard('a', mk, { conditionFloor: 'nm' })]);
    // Only NM variant should pass
    expect(result.card_results[0].all_prices).toHaveLength(1);
    expect(result.card_results[0].best_price?.price_nzd).toBe(3.0);
  });

  it('accepts variants at or better than the condition_floor', async () => {
    const mk = 'mh3::1::nonfoil';
    mockGetPrices.mockReturnValue([
      makeVariant(mk, 1, 4.0, 0),  // NM — OK for LP floor
      makeVariant(mk, 2, 3.0, 1),  // LP — OK for LP floor
      makeVariant(mk, 3, 2.0, 2),  // MP — worse than LP; excluded
    ]);
    const result = await priceDeck([makeCard('a', mk, { conditionFloor: 'lp' })]);
    expect(result.card_results[0].all_prices).toHaveLength(2);
  });

  // ── fewest-shops basket ───────────────────────────────────────────────────

  it('uses a single shop when it covers all cards', async () => {
    const mk1 = 'set::1::nonfoil';
    const mk2 = 'set::2::nonfoil';
    // Shop 1 covers both cards; Shop 2 covers only the second
    mockGetPrices.mockReturnValue([
      makeVariant(mk1, 1, 5.0),
      makeVariant(mk2, 1, 4.0),
      makeVariant(mk2, 2, 3.0),
    ]);
    const result = await priceDeck([makeCard('a', mk1), makeCard('b', mk2)]);
    // Greedy should pick Shop 1 (covers 2 cards) over Shop 2 (covers 1)
    expect(result.fewest_shops_count).toBe(1);
    expect(result.fewest_shops_basket).toHaveLength(2);
    expect(result.fewest_shops_basket.every(e => e.shop_id === 1)).toBe(true);
  });

  it('uses two shops when no single shop covers everything', async () => {
    const mk1 = 'set::1::nonfoil';
    const mk2 = 'set::2::nonfoil';
    // Shop 1 only has card A; Shop 2 only has card B
    mockGetPrices.mockReturnValue([
      makeVariant(mk1, 1, 5.0),
      makeVariant(mk2, 2, 4.0),
    ]);
    const result = await priceDeck([makeCard('a', mk1), makeCard('b', mk2)]);
    expect(result.fewest_shops_count).toBe(2);
    expect(result.fewest_shops_basket).toHaveLength(2);
  });

  it('computes fewest_shops_total correctly', async () => {
    const mk1 = 'set::1::nonfoil';
    const mk2 = 'set::2::nonfoil';
    mockGetPrices.mockReturnValue([
      makeVariant(mk1, 1, 6.0),
      makeVariant(mk2, 1, 4.0),
    ]);
    const result = await priceDeck([makeCard('a', mk1), makeCard('b', mk2)]);
    expect(result.fewest_shops_total).toBeCloseTo(10.0, 2);
  });

  it('excludes not_found cards from the basket', async () => {
    const mk1 = 'set::1::nonfoil';
    mockGetPrices.mockReturnValue([makeVariant(mk1, 1, 5.0)]);
    const result = await priceDeck([
      makeCard('a', mk1),
      makeCard('b', null), // no match_key → not_found, not in basket
    ]);
    expect(result.fewest_shops_basket).toHaveLength(1);
    expect(result.not_found_count).toBe(1);
  });

  it('returns as_of as a valid ISO string', async () => {
    const result = await priceDeck([]);
    expect(() => new Date(result.as_of)).not.toThrow();
    expect(result.as_of).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
