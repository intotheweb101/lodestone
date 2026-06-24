/**
 * Live deck comparison — diffs two decks directly from their current entries
 * (no version snapshot required). Enriches results with card images.
 */
import { getDb } from '../db/connection';

export interface CompareEntry {
  oracle_id: string;
  card_name: string;
  quantity: number;
  board: string;
  image_url: string | null;
  type_line: string | null;
  is_commander: boolean;
}

export interface LiveDiff {
  onlyInA: CompareEntry[];
  onlyInB: CompareEntry[];
  inBoth: { a: CompareEntry; b: CompareEntry; qtyChanged: boolean }[];
}

function extractImageUrl(imageUrisJson: string | null, cardFacesJson: string | null): string | null {
  if (imageUrisJson) {
    try { return (JSON.parse(imageUrisJson) as Record<string, string>).normal ?? null; } catch { /* */ }
  }
  if (cardFacesJson) {
    try {
      const faces = JSON.parse(cardFacesJson) as { image_uris?: { normal?: string } }[];
      return faces[0]?.image_uris?.normal ?? null;
    } catch { /* */ }
  }
  return null;
}

function loadEntries(deckId: string): CompareEntry[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT de.oracle_id, de.card_name, de.quantity,
           COALESCE(de.board, 'main') AS board,
           de.is_commander,
           sc.image_uris_json, sc.card_faces_json, sc.type_line
    FROM deck_entries de
    LEFT JOIN scryfall_cards sc ON sc.oracle_id = de.oracle_id
    WHERE de.deck_id = ?
    ORDER BY de.is_commander DESC, de.card_name ASC
  `).all(deckId) as {
    oracle_id: string; card_name: string; quantity: number;
    board: string; is_commander: number;
    image_uris_json: string | null; card_faces_json: string | null; type_line: string | null;
  }[];

  return rows.map(r => ({
    oracle_id: r.oracle_id,
    card_name: r.card_name,
    quantity: r.quantity,
    board: r.board,
    is_commander: r.is_commander === 1,
    image_url: extractImageUrl(r.image_uris_json, r.card_faces_json),
    type_line: r.type_line,
  }));
}

export function diffLiveDecks(deckIdA: string, deckIdB: string): LiveDiff {
  const aEntries = loadEntries(deckIdA);
  const bEntries = loadEntries(deckIdB);

  const aMap = new Map<string, CompareEntry>();
  for (const e of aEntries) aMap.set(e.oracle_id + ':' + e.board, e);

  const bMap = new Map<string, CompareEntry>();
  for (const e of bEntries) bMap.set(e.oracle_id + ':' + e.board, e);

  const onlyInA: CompareEntry[] = [];
  const onlyInB: CompareEntry[] = [];
  const inBoth: LiveDiff['inBoth'] = [];

  for (const [key, ae] of aMap) {
    const be = bMap.get(key);
    if (!be) {
      onlyInA.push(ae);
    } else {
      inBoth.push({ a: ae, b: be, qtyChanged: ae.quantity !== be.quantity });
    }
  }
  for (const [key, be] of bMap) {
    if (!aMap.has(key)) onlyInB.push(be);
  }

  // Sort all three lists: commanders first, then alphabetically
  const sortFn = (x: CompareEntry, y: CompareEntry) => {
    if (x.is_commander !== y.is_commander) return x.is_commander ? -1 : 1;
    return x.card_name.localeCompare(y.card_name);
  };
  onlyInA.sort(sortFn);
  onlyInB.sort(sortFn);
  inBoth.sort((x, y) => sortFn(x.a, y.a));

  return { onlyInA, onlyInB, inBoth };
}
