/**
 * Price history reader — returns daily best-price series for a given match_key.
 */

import { getDb } from '../db/connection';

export interface PricePoint {
  date: string;       // ISO date, e.g. "2026-06-23"
  price_nzd: number;  // lowest available price across all shops that day
}

/**
 * Returns up to `days` daily price points for the given match_key,
 * taking the minimum available price across all shops per day.
 */
export function getPriceHistory(matchKey: string, days = 90): PricePoint[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT date(captured_at) AS date, MIN(price_nzd) AS price_nzd
    FROM price_history
    WHERE match_key = ?
      AND available = 1
      AND captured_at >= datetime('now', ? || ' days')
    GROUP BY date(captured_at)
    ORDER BY date ASC
  `).all(matchKey, `-${days}`) as { date: string; price_nzd: number }[];

  return rows.map(r => ({ date: r.date, price_nzd: r.price_nzd }));
}
