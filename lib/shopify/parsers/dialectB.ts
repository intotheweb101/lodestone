/**
 * Dialect B parser — "BinderPOS" stores (Card Merchant branches).
 *
 * Title format: "Card Name [Set Name]" or "Card Name (Treatment) [Set Name]"
 * SKU format:   "<SET>-<COL>-<LANG>-<NF|FO>-<condIdx>"  e.g. "SOM-179-EN-NF-1"
 * Tags: format legalities (Commander, Legacy…), "Normal"/"Foil", set name as bare tag.
 * option1: "Near Mint" / "Lightly Played" / "Near Mint / Lightly Played Foil" etc.
 */

import type { ShopifyProduct } from '../types';
import { computeMatchResult } from '../../match/matcher';
import type { MatchResult } from '../../match/matcher';
import type { ParsedProduct, ParsedVariant } from './dialectA';

function normalizeName(raw: string): string {
  return raw.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

function extractCardName(title: string): string {
  return title.replace(/\s*[\(\[].*/g, '').trim() || title;
}

function extractSetName(title: string): string | null {
  const m = title.match(/\[([^\]]+)\]/);
  return m ? m[1] : null;
}

function extractTreatmentFlags(title: string, tags: string[]): Record<string, boolean> {
  const lower = title.toLowerCase();
  const tagStr = tags.join(' ').toLowerCase();
  return {
    borderless: lower.includes('borderless') || tagStr.includes('borderless'),
    showcase: lower.includes('showcase') || tagStr.includes('showcase'),
    extended_art: lower.includes('extended art') || lower.includes('extended-art'),
    full_art: lower.includes('full art') || lower.includes('full-art'),
    retro: lower.includes('retro'),
    etched: lower.includes('etched'),
    alternate_art: lower.includes('alternate art') || lower.includes('alt art') || lower.includes('jp alternate'),
    promo: lower.includes('promo') || tagStr.includes('promo'),
    foil: lower.includes('foil') || tagStr.includes('foil'),
  };
}

export function parseDialectBProduct(
  product: ShopifyProduct,
  baseUrl: string,
  shopCurrency = 'NZD',
  audNzdRate = 1.10,
): ParsedProduct {
  const title = product.title;
  const tags: string[] = product.tags ?? [];
  const cardName = extractCardName(title);
  const setName = extractSetName(title);
  const treatmentFlags = extractTreatmentFlags(title, tags);
  const productUrl = `${baseUrl}/products/${product.handle}`;

  const variants: ParsedVariant[] = product.variants.map(v => {
    const option1 = v.option1 ?? '';
    const option2 = v.option2 ?? undefined;

    const result: MatchResult = computeMatchResult({
      sku: v.sku,
      title,
      option1,
      option2: option2 ?? null,
      dialect: 'B',
    });

    const priceOriginal = parseFloat(v.price);
    const priceNzd = shopCurrency === 'NZD' ? priceOriginal : priceOriginal * audNzdRate;
    return {
      shopify_var_id: String(v.id),
      sku: v.sku,
      finish: result.finish,
      condition: result.condition,
      condition_rank: result.condition_rank,
      price_original: priceOriginal,
      price_nzd: priceNzd,
      currency: shopCurrency,
      available: v.available,
      match_key: result.match_key,
      confidence: result.confidence,
    };
  });

  return {
    shopify_id: String(product.id),
    handle: product.handle,
    title,
    card_name_norm: normalizeName(cardName),
    set_name_norm: setName ? normalizeName(setName) : null,
    set_code_norm: variants[0]?.match_key?.split('::')[0] ?? null,
    collector_norm: variants[0]?.match_key?.split('::')[1] ?? null,
    treatment_flags: treatmentFlags,
    product_url: productUrl,
    variants,
  };
}
