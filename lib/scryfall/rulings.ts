/**
 * Lazy-fetch rulings from Scryfall and cache them in card_rulings.
 * Fetches only on first card-page view for a given oracle_id.
 */

import { getDb } from '../db/connection';

export interface Ruling {
  oracle_id: string;
  source: string;
  published_at: string;
  comment: string;
}

/** Return cached rulings for an oracle_id, fetching from Scryfall if not yet cached. */
export async function getRulings(oracleId: string, scryfallId: string): Promise<Ruling[]> {
  const db = getDb();

  // Check if already fetched (presence of any row is enough)
  const count = (db.prepare('SELECT COUNT(*) as n FROM card_rulings WHERE oracle_id = ?').get(oracleId) as { n: number }).n;

  if (count === 0) {
    // Fetch from Scryfall rulings endpoint
    try {
      const res = await fetch(`https://api.scryfall.com/cards/${scryfallId}/rulings`, {
        headers: { 'User-Agent': 'lodestone-mtg/1.0 (hadlee.lineham@macroactive.com)' },
        next: { revalidate: 86400 }, // 24h CDN cache
      });
      if (res.ok) {
        const data = await res.json() as { data: Array<{ source: string; published_at: string; comment: string }> };
        const insert = db.prepare(
          'INSERT OR IGNORE INTO card_rulings (id, oracle_id, source, published_at, comment) VALUES (?, ?, ?, ?, ?)'
        );
        const insertAll = db.transaction(() => {
          if (!data.data?.length) {
            // Insert a sentinel row so we don't re-fetch on every page load
            insert.run(`${oracleId}-empty`, oracleId, 'scryfall', '1970-01-01', '__no_rulings__');
          } else {
            for (const r of data.data) {
              const id = `${oracleId}-${r.published_at}-${r.comment.length}`;
              insert.run(id, oracleId, r.source, r.published_at, r.comment);
            }
          }
        });
        insertAll();
      }
    } catch {
      // Fetch failed — return empty rather than breaking the page
      return [];
    }
  }

  // Return cached rulings, excluding the sentinel
  return db.prepare(
    "SELECT oracle_id, source, published_at, comment FROM card_rulings WHERE oracle_id = ? AND comment != '__no_rulings__' ORDER BY published_at ASC"
  ).all(oracleId) as Ruling[];
}
