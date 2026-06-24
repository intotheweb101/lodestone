/**
 * Deck version history — save snapshots, list, diff, and restore.
 */

import { getDb } from '../db/connection';
import { getDeck } from './store';
import { randomUUID } from 'crypto';
import type { DeckEntry } from './model';

export interface DeckVersion {
  id: string;
  deck_id: string;
  label: string | null;
  created_at: string;
  entry_count: number; // stored separately for quick listing
}

export interface DeckVersionFull extends DeckVersion {
  entries: Pick<DeckEntry, 'oracle_id' | 'card_name' | 'quantity' | 'board' | 'is_commander'>[];
}

export interface DeckDiff {
  added: { card_name: string; quantity: number; board: string }[];
  removed: { card_name: string; quantity: number; board: string }[];
  changed: { card_name: string; oldQty: number; newQty: number; board: string }[];
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────

export function snapshotDeck(deckId: string, label?: string): DeckVersion | null {
  const deck = getDeck(deckId);
  if (!deck) return null;

  const entries = deck.entries.map(e => ({
    oracle_id: e.oracle_id,
    card_name: e.card_name,
    quantity: e.quantity,
    board: e.board ?? 'main',
    is_commander: e.is_commander ? 1 : 0,
  }));

  const id = randomUUID();
  const db = getDb();

  // Keep at most 20 versions per deck (drop oldest after insert)
  db.prepare(`
    INSERT INTO deck_versions (id, deck_id, label, snapshot_json, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(id, deckId, label ?? null, JSON.stringify(entries));

  // Prune to 20 most recent
  const toDelete = db.prepare(`
    SELECT id FROM deck_versions
    WHERE deck_id = ?
    ORDER BY created_at DESC
    LIMIT -1 OFFSET 20
  `).all(deckId) as { id: string }[];
  for (const { id: vid } of toDelete) {
    db.prepare('DELETE FROM deck_versions WHERE id = ?').run(vid);
  }

  return {
    id,
    deck_id: deckId,
    label: label ?? null,
    created_at: new Date().toISOString(),
    entry_count: entries.length,
  };
}

// ─── List ──────────────────────────────────────────────────────────────────────

export function listVersions(deckId: string): DeckVersion[] {
  const rows = getDb().prepare(`
    SELECT id, deck_id, label, created_at,
           json_array_length(snapshot_json) AS entry_count
    FROM deck_versions
    WHERE deck_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(deckId) as (DeckVersion & { entry_count: number })[];
  return rows;
}

// ─── Get one ──────────────────────────────────────────────────────────────────

export function getVersion(versionId: string): DeckVersionFull | null {
  const row = getDb().prepare(
    'SELECT id, deck_id, label, created_at, snapshot_json FROM deck_versions WHERE id = ?'
  ).get(versionId) as { id: string; deck_id: string; label: string | null; created_at: string; snapshot_json: string } | undefined;
  if (!row) return null;

  const entries = JSON.parse(row.snapshot_json) as DeckVersionFull['entries'];
  return {
    id: row.id,
    deck_id: row.deck_id,
    label: row.label,
    created_at: row.created_at,
    entry_count: entries.length,
    entries,
  };
}

// ─── Diff ─────────────────────────────────────────────────────────────────────

type EntrySnap = { oracle_id: string; card_name: string; quantity: number; board: string };

export function diffVersions(aId: string, bId: string): DeckDiff | null {
  const a = getVersion(aId);
  const b = getVersion(bId);
  if (!a || !b) return null;

  const aMap = new Map<string, EntrySnap>();
  for (const e of a.entries as EntrySnap[]) aMap.set(e.oracle_id + ':' + e.board, e);

  const bMap = new Map<string, EntrySnap>();
  for (const e of b.entries as EntrySnap[]) bMap.set(e.oracle_id + ':' + e.board, e);

  const added: DeckDiff['added'] = [];
  const removed: DeckDiff['removed'] = [];
  const changed: DeckDiff['changed'] = [];

  for (const [key, be] of bMap) {
    const ae = aMap.get(key);
    if (!ae) added.push({ card_name: be.card_name, quantity: be.quantity, board: be.board });
    else if (ae.quantity !== be.quantity) changed.push({ card_name: be.card_name, oldQty: ae.quantity, newQty: be.quantity, board: be.board });
  }
  for (const [key, ae] of aMap) {
    if (!bMap.has(key)) removed.push({ card_name: ae.card_name, quantity: ae.quantity, board: ae.board });
  }

  return { added, removed, changed };
}

// ─── Restore ──────────────────────────────────────────────────────────────────

export function restoreVersion(deckId: string, versionId: string, userId: string): boolean {
  const db = getDb();
  const version = getVersion(versionId);
  if (!version || version.deck_id !== deckId) return false;

  // Verify ownership
  const deck = db.prepare('SELECT user_id FROM decks WHERE id = ?').get(deckId) as { user_id: string } | undefined;
  if (!deck || deck.user_id !== userId) return false;

  const restore = db.transaction(() => {
    db.prepare('DELETE FROM deck_entries WHERE deck_id = ?').run(deckId);
    for (const e of version.entries as EntrySnap[]) {
      db.prepare(`
        INSERT INTO deck_entries (deck_id, oracle_id, card_name, quantity, is_commander, board)
        VALUES (?, ?, ?, ?, 0, ?)
      `).run(deckId, e.oracle_id, e.card_name, e.quantity, e.board ?? 'main');
    }
    db.prepare(`UPDATE decks SET updated_at = datetime('now') WHERE id = ?`).run(deckId);
  });

  restore();
  return true;
}
