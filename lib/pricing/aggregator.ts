/**
 * Price aggregation + basket optimization.
 *
 * Given a list of cards (each with match_key + condition floor),
 * returns:
 *  1. best_per_card — cheapest available price across all shops per card
 *  2. fewest_shops_basket — the minimum-shop selection that covers all cards (greedy)
 */

import { getPricesByMatchKeys, type VariantPrice } from '../db/queries';

export interface CardPriceRequest {
  entry_id: string;      // e.g. oracle_id or deck entry id — just an opaque key
  card_name: string;
  match_key: string | null;
  finish: string;
  condition_floor: string;  // 'nm' | 'lp' | 'mp' | 'hp'
}

export interface ShopPrice {
  shop_id: number;
  shop_name: string;
  shop_url: string;
  product_url: string | null;
  price_nzd: number;
  price_original: number | null;  // as listed in shop's own currency (may be AUD)
  currency: string;               // 'NZD' | 'AUD'
  condition: string;
  finish: string;
  confidence: string;
}

export interface CardPriceResult {
  entry_id: string;
  card_name: string;
  match_key: string | null;
  best_price: ShopPrice | null;
  all_prices: ShopPrice[];  // all shops, sorted by price
  not_found: boolean;
}

export interface BasketEntry {
  entry_id: string;
  card_name: string;
  shop_id: number;
  shop_name: string;
  price_nzd: number;
  product_url: string | null;
}

export interface PricedDeck {
  card_results: CardPriceResult[];
  best_per_card_total: number;
  fewest_shops_basket: BasketEntry[];
  fewest_shops_total: number;
  fewest_shops_count: number;
  not_found_count: number;
  as_of: string;
}

const CONDITION_RANK: Record<string, number> = {
  nm: 0, 'near mint': 0,
  lp: 1, 'lightly played': 1, sp: 1,
  mp: 2, 'moderately played': 2,
  hp: 3, 'heavily played': 3,
  dmg: 4, damaged: 4,
};

export async function priceDeck(cards: CardPriceRequest[]): Promise<PricedDeck> {
  const validCards = cards.filter(c => c.match_key);
  const matchKeys = validCards.map(c => c.match_key!);

  // Fetch all prices in one indexed query
  const allVariants: VariantPrice[] = matchKeys.length > 0
    ? getPricesByMatchKeys(matchKeys, 2 /* MP max */)
    : [];

  // Group by match_key
  const byKey = new Map<string, VariantPrice[]>();
  for (const v of allVariants) {
    if (!v.match_key) continue;
    const list = byKey.get(v.match_key) ?? [];
    list.push(v);
    byKey.set(v.match_key, list);
  }

  // Build per-card results
  const cardResults: CardPriceResult[] = cards.map(card => {
    if (!card.match_key) {
      return {
        entry_id: card.entry_id,
        card_name: card.card_name,
        match_key: null,
        best_price: null,
        all_prices: [],
        not_found: true,
      };
    }

    const condRank = CONDITION_RANK[card.condition_floor.toLowerCase()] ?? 2;
    const variants = (byKey.get(card.match_key) ?? [])
      .filter(v => v.condition_rank <= condRank && v.available)
      .sort((a, b) => a.price_nzd - b.price_nzd);

    const all_prices: ShopPrice[] = variants.map(v => ({
      shop_id: v.shop_id,
      shop_name: v.shop_name,
      shop_url: v.shop_base_url,
      product_url: v.product_url,
      price_nzd: v.price_nzd,
      price_original: v.price_original ?? null,
      currency: v.shop_currency ?? v.currency ?? 'NZD',
      condition: v.condition,
      finish: v.finish,
      confidence: v.confidence,
    }));

    // Deduplicate: one best price per shop
    const seenShops = new Set<number>();
    const bestPerShop = all_prices.filter(p => {
      if (seenShops.has(p.shop_id)) return false;
      seenShops.add(p.shop_id);
      return true;
    });

    return {
      entry_id: card.entry_id,
      card_name: card.card_name,
      match_key: card.match_key,
      best_price: bestPerShop[0] ?? null,
      all_prices: bestPerShop,
      not_found: bestPerShop.length === 0,
    };
  });

  // ---- Best per card total ----
  const best_per_card_total = cardResults.reduce(
    (sum, r) => sum + (r.best_price?.price_nzd ?? 0), 0
  );

  // ---- Fewest-shops basket (greedy cover) ----
  // For each shop, compute how many cards it covers and at what total cost
  // Greedy: pick the shop with the best coverage+cost, repeat until all covered

  const uncovered = new Set(cardResults.filter(r => !r.not_found).map(r => r.entry_id));
  const basket: BasketEntry[] = [];

  // Build shop→cards coverage map
  const shopCoverage = new Map<number, { shop_name: string; cards: Map<string, ShopPrice> }>();
  for (const result of cardResults) {
    for (const price of result.all_prices) {
      let shopData = shopCoverage.get(price.shop_id);
      if (!shopData) {
        shopData = { shop_name: price.shop_name, cards: new Map() };
        shopCoverage.set(price.shop_id, shopData);
      }
      // Keep only cheapest price per shop per card
      const existing = shopData.cards.get(result.entry_id);
      if (!existing || price.price_nzd < existing.price_nzd) {
        shopData.cards.set(result.entry_id, price);
      }
    }
  }

  while (uncovered.size > 0) {
    let bestShopId = -1;
    let bestScore = -Infinity;
    let bestShopData: { shop_name: string; cards: Map<string, ShopPrice> } | null = null;

    for (const [shopId, shopData] of shopCoverage) {
      const coveredByShop = [...shopData.cards.keys()].filter(id => uncovered.has(id));
      if (coveredByShop.length === 0) continue;

      // Score = coverage count (primary) - normalized avg cost (secondary)
      const avgCost = coveredByShop.reduce((s, id) => s + (shopData.cards.get(id)?.price_nzd ?? 0), 0) / coveredByShop.length;
      const score = coveredByShop.length * 1000 - avgCost;

      if (score > bestScore) {
        bestScore = score;
        bestShopId = shopId;
        bestShopData = shopData;
      }
    }

    if (bestShopId === -1 || !bestShopData) break; // no more shops can cover remaining cards

    // Add all cards this shop can cover from the still-uncovered set
    for (const [entryId, price] of bestShopData.cards) {
      if (uncovered.has(entryId)) {
        basket.push({
          entry_id: entryId,
          card_name: cardResults.find(r => r.entry_id === entryId)?.card_name ?? '',
          shop_id: bestShopId,
          shop_name: bestShopData.shop_name,
          price_nzd: price.price_nzd,
          product_url: price.product_url,
        });
        uncovered.delete(entryId);
      }
    }
  }

  const fewest_shops_total = basket.reduce((s, e) => s + e.price_nzd, 0);
  const fewest_shops_count = new Set(basket.map(e => e.shop_id)).size;
  const not_found_count = cardResults.filter(r => r.not_found).length;

  return {
    card_results: cardResults,
    best_per_card_total,
    fewest_shops_basket: basket,
    fewest_shops_total,
    fewest_shops_count,
    not_found_count,
    as_of: new Date().toISOString(),
  };
}
