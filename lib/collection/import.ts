/**
 * Collection CSV import — resolution + merge logic (DB-touching).
 *
 * Resolves parsed CSV rows against scryfall_cards (set+collector first,
 * then name fallback) and merges into user_collection.
 */

import { getDb } from '../db/connection';
import { getScryfallCardBySetNumber } from '../db/queries';
import { getCollectionMap, upsertCollectionEntry } from './store';
import type { ParsedRow } from './csv';
import { normalizeCollector } from '../match/normalize';

export type ImportMode = 'merge' | 'replace';

export interface UnmatchedRow {
  name: string;
  setCode: string | null;
  reason: string;
}

export interface ImportReport {
  formatDetected: string;
  totalRows: number;
  matched: number;
  added: number;
  mergedQty: number;
  unmatched: UnmatchedRow[];
}

export function resolveAndImport(
  userId: string,
  rows: ParsedRow[],
  opts: { mode?: ImportMode; formatDetected?: string },
): ImportReport {
  const db = getDb();
  const mode = opts.mode ?? 'merge';

  // Read existing collection once for merge math
  const existing = mode === 'merge' ? getCollectionMap(userId) : new Map();

  const report: ImportReport = {
    formatDetected: opts.formatDetected ?? 'generic',
    totalRows: rows.length,
    matched: 0,
    added: 0,
    mergedQty: 0,
    unmatched: [],
  };

  // Resolve all rows then write in one transaction
  interface Resolved {
    oracle_id: string;
    scryfall_id: string;
    quantity: number;
    foil: boolean;
  }
  const resolved: Resolved[] = [];

  for (const row of rows) {
    let card: { oracle_id: string; scryfall_id: string } | null = null;

    // 1. Resolve by set + collector number (most precise)
    if (row.setCode && row.collectorNumber) {
      const sc = getScryfallCardBySetNumber(row.setCode, normalizeCollector(row.collectorNumber));
      if (sc) card = { oracle_id: sc.oracle_id, scryfall_id: sc.scryfall_id };
    }

    // 2. Fallback: name-norm lookup (mirrors actionImportDecklist)
    if (!card && row.name) {
      const norm = row.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const sc = db.prepare(
        'SELECT scryfall_id, oracle_id FROM scryfall_cards WHERE name_norm = ? LIMIT 1'
      ).get(norm) as { scryfall_id: string; oracle_id: string } | undefined;
      if (sc) card = { oracle_id: sc.oracle_id, scryfall_id: sc.scryfall_id };
    }

    if (!card) {
      report.unmatched.push({
        name: row.name,
        setCode: row.setCode,
        reason: row.setCode
          ? `Not found: "${row.name}" in set ${row.setCode}`
          : `Not found: "${row.name}"`,
      });
      continue;
    }

    report.matched++;
    resolved.push({ oracle_id: card.oracle_id, scryfall_id: card.scryfall_id, quantity: row.quantity, foil: row.foil });
  }

  // Write all resolved entries in a single transaction
  db.transaction(() => {
    for (const r of resolved) {
      const key = r.oracle_id + ':' + (r.foil ? '1' : '0');
      const existingEntry = existing.get(key);

      if (existingEntry) {
        // Merge: add imported qty to existing
        const newQty = existingEntry.quantity + r.quantity;
        upsertCollectionEntry(userId, r.oracle_id, {
          scryfall_id: r.scryfall_id,
          quantity: newQty,
          foil: r.foil,
        });
        report.mergedQty += r.quantity;
      } else {
        upsertCollectionEntry(userId, r.oracle_id, {
          scryfall_id: r.scryfall_id,
          quantity: r.quantity,
          foil: r.foil,
        });
        report.added++;
      }
    }
  })();

  return report;
}
