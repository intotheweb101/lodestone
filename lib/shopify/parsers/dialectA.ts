/**
 * Dialect A parser — "TCG-synced" stores (Calico Keep, Shuffle & Cut).
 *
 * Title format: "Card Name (Treatment) (SETCODE-COL) [Set Name] Foil?"
 * SKU format:   "MTG-<SET>-<COL>-<F|NF>-<hash>-<condIdx>"
 * Tags include: "Set_<name>", "Printing_Foil|Non-Foil", "Rarity_<r>", "Number_<n>"
 */

import type { ShopifyProduct } from '../types';
import { computeMatchResult } from '../../match/matcher';
import type { MatchResult } from '../../match/matcher';

export interface ParsedVariant {
  shopify_var_id: string;
  sku: string | null;
  finish: string;
  condition: string;
  condition_rank: number;
  price_original: number;  // as-listed price in shop's own currency
  price_nzd: number;       // always NZD (converted if AUD)
  currency: string;        // 'NZD' | 'AUD'
  available: boolean;
  match_key: string | null;
  confidence: string;
}

export interface ParsedProduct {
  shopify_id: string;
  handle: string;
  title: string;
  card_name_norm: string;
  set_name_norm: string | null;
  set_code_norm: string | null;
  collector_norm: string | null;
  treatment_flags: Record<string, boolean>;
  product_url: string;
  variants: ParsedVariant[];
}

function normalizeName(raw: string): string {
  return raw.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

function extractCardName(title: string): string {
  // Remove everything from first ( or [ onwards
  const name = title.replace(/\s*[\(\[].*/g, '').trim();
  return name || title;
}

function extractSetName(title: string): string | null {
  const m = title.match(/\[([^\]]+)\]/);
  return m ? m[1] : null;
}

function extractTreatmentFlags(title: string): Record<string, boolean> {
  const lower = title.toLowerCase();
  return {
    borderless: lower.includes('borderless'),
    showcase: lower.includes('showcase'),
    extended_art: lower.includes('extended art') || lower.includes('extended-art'),
    full_art: lower.includes('full art') || lower.includes('full-art'),
    retro: lower.includes('retro'),
    etched: lower.includes('etched'),
    alternate_art: lower.includes('alternate art') || lower.includes('alt art') || lower.includes('jp alternate'),
    promo: lower.includes('promo'),
  };
}

export function parseDialectAProduct(
  product: ShopifyProduct,
  baseUrl: string,
  shopCurrency = 'NZD',
  audNzdRate = 1.10,
): ParsedProduct {
  const title = product.title;
  const cardName = extractCardName(title);
  const setName = extractSetName(title);
  const treatmentFlags = extractTreatmentFlags(title);
  const productUrl = `${baseUrl}/products/${product.handle}`;

  const variants: ParsedVariant[] = product.variants.map(v => {
    const option1 = v.option1 ?? '';
    const option2 = v.option2 ?? undefined;

    const result: MatchResult = computeMatchResult({
      sku: v.sku,
      title,
      option1,
      option2: option2 ?? null,
      dialect: 'A',
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
