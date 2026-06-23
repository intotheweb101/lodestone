/**
 * EDHREC card data — lazy-fetch and cache in edhrec_card_cache (7-day TTL).
 * API: https://json.edhrec.com/pages/cards/{slug}.json
 */

import { getDb } from '../db/connection';

export interface EdhrecCardData {
  slug: string;
  salt: number | null;
  num_decks: number | null;
  potential_decks: number | null;
  inclusion_pct: number | null;
  top_commanders: { name: string; image: string | null; num_decks: number }[];
  synergy_cards: { name: string; image: string | null; synergy: number }[];
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[',]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface CacheRow {
  oracle_id: string;
  slug: string;
  salt: number | null;
  num_decks: number | null;
  potential_decks: number | null;
  top_commanders_json: string;
  synergy_cards_json: string;
  fetched_at: string;
}

function rowToData(row: CacheRow): EdhrecCardData {
  const num = row.num_decks;
  const pot = row.potential_decks;
  return {
    slug: row.slug,
    salt: row.salt,
    num_decks: num,
    potential_decks: pot,
    inclusion_pct: num != null && pot != null && pot > 0 ? Math.round((num / pot) * 1000) / 10 : null,
    top_commanders: JSON.parse(row.top_commanders_json || '[]'),
    synergy_cards: JSON.parse(row.synergy_cards_json || '[]'),
  };
}

function parseResponse(raw: unknown): Omit<EdhrecCardData, 'inclusion_pct'> & { raw_json: string } {
  const r = raw as Record<string, unknown>;
  const dict = (r?.container as Record<string, unknown>)?.json_dict as Record<string, unknown> | undefined;
  const card = dict?.card as Record<string, unknown> | undefined;
  const cardlists = (dict?.cardlists as unknown[]) ?? [];

  const salt = typeof card?.salt === 'number' ? card.salt : null;
  const num_decks = typeof card?.num_decks === 'number' ? card.num_decks : null;
  const potential_decks = typeof card?.potential_decks === 'number' ? card.potential_decks : null;

  const getImage = (cv: Record<string, unknown>): string | null => {
    const uris = cv?.image_uris as Record<string, string> | undefined;
    return uris?.art_crop ?? uris?.normal ?? null;
  };

  const top_commanders: EdhrecCardData['top_commanders'] = [];
  const synergy_cards: EdhrecCardData['synergy_cards'] = [];

  for (const list of cardlists) {
    const l = list as Record<string, unknown>;
    const header = String(l?.header ?? '').toLowerCase();
    const tag = String(l?.tag ?? '').toLowerCase();
    const views = (l?.cardviews as unknown[]) ?? [];

    if (tag === 'topcommanders' || header.includes('commander')) {
      for (const cv of views.slice(0, 8)) {
        const c = cv as Record<string, unknown>;
        top_commanders.push({
          name: String(c?.name ?? ''),
          image: getImage(c),
          num_decks: typeof c?.num_decks === 'number' ? c.num_decks : 0,
        });
      }
    } else if (tag === 'synergy' || header.includes('synergy')) {
      for (const cv of views.slice(0, 12)) {
        const c = cv as Record<string, unknown>;
        synergy_cards.push({
          name: String(c?.name ?? ''),
          image: getImage(c),
          synergy: typeof c?.synergy_score === 'number' ? c.synergy_score : 0,
        });
      }
    }
  }

  return {
    slug: '',
    salt,
    num_decks,
    potential_decks,
    top_commanders,
    synergy_cards,
    raw_json: JSON.stringify(raw),
  };
}

export async function getEdhrecData(oracleId: string, cardName: string): Promise<EdhrecCardData | null> {
  const db = getDb();
  const slug = slugify(cardName);

  // Check cache (7-day TTL)
  try {
    const cached = db.prepare(
      "SELECT * FROM edhrec_card_cache WHERE oracle_id = ? AND fetched_at > datetime('now', '-7 days')"
    ).get(oracleId) as CacheRow | undefined;
    if (cached) return rowToData(cached);
  } catch {
    // Table may not exist yet; fall through to fetch
  }

  // Fetch from EDHREC
  try {
    const url = `https://json.edhrec.com/pages/cards/${slug}.json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'lodestone-mtg/1.0 (hadlee.lineham@macroactive.com)' },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;

    const raw = await res.json() as unknown;
    const parsed = parseResponse(raw);

    // Upsert into cache
    try {
      db.prepare(`
        INSERT INTO edhrec_card_cache
          (oracle_id, slug, salt, num_decks, potential_decks, top_commanders_json, synergy_cards_json, raw_json, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(oracle_id) DO UPDATE SET
          slug = excluded.slug, salt = excluded.salt,
          num_decks = excluded.num_decks, potential_decks = excluded.potential_decks,
          top_commanders_json = excluded.top_commanders_json,
          synergy_cards_json = excluded.synergy_cards_json,
          raw_json = excluded.raw_json, fetched_at = excluded.fetched_at
      `).run(
        oracleId, slug,
        parsed.salt, parsed.num_decks, parsed.potential_decks,
        JSON.stringify(parsed.top_commanders),
        JSON.stringify(parsed.synergy_cards),
        parsed.raw_json,
      );
    } catch { /* silently skip cache write if table not ready */ }

    const num = parsed.num_decks;
    const pot = parsed.potential_decks;
    return {
      slug,
      salt: parsed.salt,
      num_decks: num,
      potential_decks: pot,
      inclusion_pct: num != null && pot != null && pot > 0 ? Math.round((num / pot) * 1000) / 10 : null,
      top_commanders: parsed.top_commanders,
      synergy_cards: parsed.synergy_cards,
    };
  } catch {
    return null;
  }
}
