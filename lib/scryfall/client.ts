/**
 * Scryfall HTTP client — rate-limited, correct UA, retry on 429.
 * Must set User-Agent + Accept: application/json or Scryfall returns 403.
 */

const BASE_URL = 'https://api.scryfall.com';
const UA = 'mtg-deck-builder/1.0 (hadlee.lineham@macroactive.com; personal deck tool)';

let _lastRequestAt = 0;
const MIN_INTERVAL_MS = 110; // ~9 req/s, safely under Scryfall's ~10 req/s limit

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - _lastRequestAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  _lastRequestAt = Date.now();

  const response = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'application/json',
    },
  });

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') ?? '1', 10);
    console.warn(`[scryfall] Rate limited. Retrying after ${retryAfter}s...`);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return rateLimitedFetch(url);
  }

  return response;
}

export async function scryfallGet<T>(path: string): Promise<T> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    throw new Error(`Scryfall ${response.status} for ${url}: ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}

/** GET /cards/autocomplete?q= — returns array of card name strings */
export async function autocomplete(q: string): Promise<string[]> {
  if (!q || q.length < 2) return [];
  const data = await scryfallGet<{ data: string[] }>(`/cards/autocomplete?q=${encodeURIComponent(q)}`);
  return data.data ?? [];
}

/** GET /cards/named?fuzzy= — returns a single card object (the most played printing) */
export async function namedCard(name: string): Promise<ScryfallCardRaw | null> {
  try {
    return await scryfallGet<ScryfallCardRaw>(`/cards/named?fuzzy=${encodeURIComponent(name)}`);
  } catch {
    return null;
  }
}

/** GET /cards/search with prints:unique — returns all printings */
export async function searchAllPrintings(name: string): Promise<ScryfallCardRaw[]> {
  const results: ScryfallCardRaw[] = [];
  let url = `/cards/search?q=${encodeURIComponent(`!"${name}"`)}&unique=prints&order=released&dir=desc`;

  while (url) {
    const page = await scryfallGet<{ data: ScryfallCardRaw[]; next_page?: string; has_more: boolean }>(url);
    results.push(...page.data);
    url = page.has_more && page.next_page ? page.next_page : '';
  }

  return results;
}

/** GET /bulk-data — returns info about the bulk data files */
export async function getBulkDataInfo(): Promise<BulkDataInfo[]> {
  const data = await scryfallGet<{ data: BulkDataInfo[] }>('/bulk-data');
  return data.data;
}

/** GET /sets — returns all sets */
export async function getAllSets(): Promise<ScryfallSet[]> {
  const data = await scryfallGet<{ data: ScryfallSet[] }>('/sets');
  return data.data;
}

// ---- Raw Scryfall types (minimal) ----

export interface ScryfallCardRaw {
  id: string;
  oracle_id: string;
  name: string;
  set: string;
  collector_number: string;
  finishes: string[];
  frame_effects?: string[];
  border_color?: string;
  full_art?: boolean;
  promo_types?: string[];
  color_identity: string[];
  colors?: string[];         // card colors (may differ from identity for some cards)
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  rarity: string;
  legalities?: Record<string, string>;
  prices?: Record<string, string | null>;
  image_uris?: Record<string, string>;
  card_faces?: Array<{
    oracle_text?: string;
    power?: string;
    toughness?: string;
    loyalty?: string;
    colors?: string[];
    type_line?: string;
  }>;
  prints_search_uri?: string;
  // Advanced search + rich card page fields
  power?: string;
  toughness?: string;
  loyalty?: string;
  keywords?: string[];
  artist?: string;
  flavor_text?: string;
  released_at?: string;
}

export interface BulkDataInfo {
  id: string;
  type: string;
  name: string;
  download_uri: string;
  updated_at: string;
  size: number;
}

export interface ScryfallSet {
  code: string;
  name: string;
  set_type: string;
  parent_set_code?: string;
  released_at?: string;
  card_count?: number;
  icon_svg_uri?: string;
}
