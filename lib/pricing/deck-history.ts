/**
 * Historical NZD price totals for a deck, aggregated from price_history.
 */
import { getDb } from '../db/connection';
import { getDeck } from '../deck/store';
import { mainboardEntries } from '../deck/model';
import { buildMatchKey } from '../match/normalize';
import { getScryfallCardsByOracleId } from '../db/queries';

export interface DeckPricePoint {
  date: string;        // YYYY-MM-DD
  totalNzd: number;    // sum of best price per card × quantity
  cardsCovered: number;
}

interface EntryKey {
  match_key: string;
  quantity: number;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export function getDeckPriceHistory(deckId: string, days = 90): DeckPricePoint[] {
  const deck = getDeck(deckId);
  if (!deck) return [];

  const db = getDb();

  // Build match_key → quantity map for mainboard entries
  const entryKeys: EntryKey[] = [];
  const keyToQty = new Map<string, number>();

  for (const entry of mainboardEntries(deck)) {
    let mk: string | null = null;

    if (entry.scryfall_id) {
      const rows = db.prepare(
        'SELECT set_code, collector_number FROM scryfall_cards WHERE id = ? LIMIT 1'
      ).all(entry.scryfall_id) as { set_code: string; collector_number: string }[];
      if (rows.length > 0) {
        const finish = entry.finish === 'foil' ? 'foil' : entry.finish === 'etched' ? 'etched' : 'nonfoil';
        mk = buildMatchKey(rows[0].set_code, rows[0].collector_number, finish);
      }
    }

    if (!mk) {
      const printings = getScryfallCardsByOracleId(entry.oracle_id);
      if (printings.length > 0) {
        const finish = entry.finish === 'foil' ? 'foil' : entry.finish === 'etched' ? 'etched' : 'nonfoil';
        mk = buildMatchKey(printings[0].set_code, printings[0].collector_number, finish);
      }
    }

    if (!mk) continue;

    entryKeys.push({ match_key: mk, quantity: entry.quantity });
    // If the same match_key appears multiple times (e.g. same card different entries), sum quantities
    keyToQty.set(mk, (keyToQty.get(mk) ?? 0) + entry.quantity);
  }

  if (entryKeys.length === 0) return [];

  const uniqueKeys = [...keyToQty.keys()];

  // Fetch price history in chunks to stay under SQLite's 999 bind-param limit
  const allRows: { date: string; match_key: string; best_price: number }[] = [];

  for (const chunk of chunkArray(uniqueKeys, 900)) {
    const ph = chunk.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT
        DATE(recorded_at) AS date,
        match_key,
        MIN(price_nzd) AS best_price
      FROM price_history
      WHERE match_key IN (${ph})
        AND recorded_at >= DATE('now', '-${days} days')
      GROUP BY DATE(recorded_at), match_key
      ORDER BY date ASC
    `).all(...chunk) as { date: string; match_key: string; best_price: number }[];
    allRows.push(...rows);
  }

  if (allRows.length === 0) return [];

  // Aggregate by date
  const byDate = new Map<string, { total: number; covered: number }>();

  for (const row of allRows) {
    const qty = keyToQty.get(row.match_key) ?? 1;
    const existing = byDate.get(row.date) ?? { total: 0, covered: 0 };
    existing.total += row.best_price * qty;
    existing.covered += 1;
    byDate.set(row.date, existing);
  }

  return [...byDate.entries()]
    .filter(([, v]) => v.covered > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      totalNzd: Math.round(v.total * 100) / 100,
      cardsCovered: v.covered,
    }));
}
