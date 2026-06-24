import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { runMigrations } from '@/lib/db/migrations';
import { resolveActingUser } from '@/lib/auth/session';
import { getDeck } from '@/lib/deck/store';
import { listDecks, listPublicDecks } from '@/lib/deck/store';
import { diffLiveDecks } from '@/lib/deck/compare';
import type { CompareEntry } from '@/lib/deck/compare';
import { canView } from '@/lib/auth/access';
import { ComparePicker } from './compare-client';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Compare Decks — Lodestone' };

let migrated = false;

// ─── Styles ───────────────────────────────────────────────────────────────────

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  overflow: 'hidden',
};

const mono: CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

const colHead: CSSProperties = {
  padding: '12px 14px',
  fontSize: '11px',
  ...mono,
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  fontWeight: 700,
  borderBottom: '1px solid var(--border)',
};

// ─── Card row ─────────────────────────────────────────────────────────────────

function EntryRow({ entry, qty }: { entry: CompareEntry; qty?: { a: number; b: number } }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '5px 10px',
      borderBottom: '1px solid var(--border)',
    }}>
      {entry.image_url ? (
        <img
          src={entry.image_url}
          alt={entry.card_name}
          style={{ width: '28px', borderRadius: '3px', flexShrink: 0 }}
          loading="lazy"
        />
      ) : (
        <div style={{ width: '28px', height: '39px', background: 'var(--border)', borderRadius: '3px', flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12.5px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.card_name}
        </div>
        {entry.type_line && (
          <div style={{ fontSize: '10px', color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.type_line.split('—')[0].trim()}
          </div>
        )}
      </div>
      {qty ? (
        <div style={{ ...mono, fontSize: '11px', flexShrink: 0, color: 'var(--accent)' }}>
          {qty.a}→{qty.b}
        </div>
      ) : (
        <div style={{ ...mono, fontSize: '11px', flexShrink: 0, color: 'var(--text-faint)' }}>
          ×{entry.quantity}
        </div>
      )}
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function DiffColumn({
  title,
  count,
  entries,
  accentColor,
  bg,
}: {
  title: string;
  count: number;
  entries: CompareEntry[];
  accentColor: string;
  bg: string;
}) {
  const boards = ['main', 'side', 'maybe'];
  const byBoard = boards.map(b => ({
    board: b,
    items: entries.filter(e => e.board === b),
  })).filter(g => g.items.length > 0);

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ ...colHead, background: bg, color: accentColor }}>
        {title}
        <span style={{ marginLeft: 8, fontWeight: 400, opacity: 0.7 }}>({count})</span>
      </div>
      {count === 0 ? (
        <div style={{ padding: '20px 14px', fontSize: '12px', color: 'var(--text-faint)', textAlign: 'center' }}>
          No unique cards
        </div>
      ) : (
        <div style={{ overflowY: 'auto', maxHeight: '60vh' }}>
          {byBoard.map(({ board, items }) => (
            <div key={board}>
              {byBoard.length > 1 && (
                <div style={{ padding: '6px 10px 2px', fontSize: '9px', ...mono, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' }}>
                  {board}board
                </div>
              )}
              {items.map(e => <EntryRow key={e.oracle_id + ':' + e.board} entry={e} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Shared column ────────────────────────────────────────────────────────────

function SharedColumn({
  inBoth,
}: {
  inBoth: { a: CompareEntry; b: CompareEntry; qtyChanged: boolean }[];
}) {
  const boards = ['main', 'side', 'maybe'];
  const byBoard = boards.map(b => ({
    board: b,
    items: inBoth.filter(e => e.a.board === b),
  })).filter(g => g.items.length > 0);

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ ...colHead, background: 'rgba(232,177,74,0.06)', color: 'var(--accent)' }}>
        In Both
        <span style={{ marginLeft: 8, fontWeight: 400, opacity: 0.7 }}>({inBoth.length})</span>
      </div>
      {inBoth.length === 0 ? (
        <div style={{ padding: '20px 14px', fontSize: '12px', color: 'var(--text-faint)', textAlign: 'center' }}>No overlap</div>
      ) : (
        <div style={{ overflowY: 'auto', maxHeight: '60vh' }}>
          {byBoard.map(({ board, items }) => (
            <div key={board}>
              {byBoard.length > 1 && (
                <div style={{ padding: '6px 10px 2px', fontSize: '9px', ...mono, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' }}>
                  {board}board
                </div>
              )}
              {items.map(({ a, b, qtyChanged }) => (
                <EntryRow
                  key={a.oracle_id + ':' + a.board}
                  entry={a}
                  qty={qtyChanged ? { a: a.quantity, b: b.quantity } : undefined}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  if (!migrated) { runMigrations(); migrated = true; }

  const user = await resolveActingUser();
  const { a: deckAId, b: deckBId } = await searchParams;

  // Build deck option list: own decks + public decks (deduped by id)
  const ownDecks = user.id !== 'local' ? listDecks(user.id) : [];
  const publicDecks = listPublicDecks(100, 0);
  const seen = new Set(ownDecks.map(d => d.id));
  const allOptions = [
    ...ownDecks,
    ...publicDecks.filter(d => !seen.has(d.id)),
  ];

  // Try to load and diff if both params provided
  let deckA = deckAId ? getDeck(deckAId) : null;
  let deckB = deckBId ? getDeck(deckBId) : null;

  // Enforce visibility
  if (deckA && !canView(deckA, user)) deckA = null;
  if (deckB && !canView(deckB, user)) deckB = null;

  const diff = deckA && deckB ? diffLiveDecks(deckA.id, deckB.id) : null;

  const deckACards = diff ? diff.onlyInA.length + diff.inBoth.length : 0;
  const deckBCards = diff ? diff.onlyInB.length + diff.inBoth.length : 0;
  const similarity = diff && (deckACards + deckBCards) > 0
    ? Math.round((diff.inBoth.length * 2) / (deckACards + deckBCards) * 100)
    : null;

  return (
    <div style={{ maxWidth: '1300px', margin: '0 auto', padding: '2rem 1.5rem', color: 'var(--text)' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ ...mono, fontSize: '11px', color: 'var(--accent)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
          Compare
        </p>
        <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
          Deck Comparison
        </h1>
        <p style={{ color: 'var(--text-faint)', fontSize: '12px' }}>
          Side-by-side diff of any two decks.
        </p>
      </div>

      {/* Picker */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '16px 20px', marginBottom: '1.5rem',
      }}>
        <ComparePicker
          decks={allOptions.map(d => ({
            id: d.id, name: d.name, format: d.format ?? null,
            commander: d.commander ?? null, card_count: d.card_count,
            visibility: d.visibility,
          }))}
          initialA={deckAId ?? ''}
          initialB={deckBId ?? ''}
        />
      </div>

      {/* Summary bar */}
      {diff && deckA && deckB && similarity !== null && (
        <div style={{
          display: 'flex', gap: '12px', flexWrap: 'wrap',
          marginBottom: '1.5rem',
        }}>
          {[
            { label: 'Deck A', value: deckACards + ' cards', sub: deckA.name },
            { label: 'Deck B', value: deckBCards + ' cards', sub: deckB.name },
            { label: 'Shared', value: diff.inBoth.length + ' cards', accent: true },
            { label: 'Similarity', value: similarity + '%', accent: true },
            { label: 'Only in A', value: diff.onlyInA.length + ' cards' },
            { label: 'Only in B', value: diff.onlyInB.length + ' cards' },
          ].map(chip => (
            <div key={chip.label} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '10px 16px', flex: '1 1 100px',
            }}>
              <div style={{ fontSize: '9.5px', ...mono, color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '3px' }}>
                {chip.label}
              </div>
              <div style={{ ...mono, fontSize: '16px', fontWeight: 700, color: chip.accent ? 'var(--accent)' : 'var(--text)', lineHeight: 1 }}>
                {chip.value}
              </div>
              {chip.sub && (
                <div style={{ fontSize: '10px', color: 'var(--text-faint)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {chip.sub}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Diff columns */}
      {diff ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', alignItems: 'start' }}>
          <DiffColumn
            title={`Only in ${deckA?.name ?? 'A'}`}
            count={diff.onlyInA.length}
            entries={diff.onlyInA}
            accentColor="#e2645c"
            bg="rgba(226,100,92,0.08)"
          />
          <SharedColumn inBoth={diff.inBoth} />
          <DiffColumn
            title={`Only in ${deckB?.name ?? 'B'}`}
            count={diff.onlyInB.length}
            entries={diff.onlyInB}
            accentColor="#54c08a"
            bg="rgba(84,192,138,0.08)"
          />
        </div>
      ) : (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '14px', padding: '56px 24px',
          textAlign: 'center', color: 'var(--text-faint)', fontSize: '13px',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>↔</div>
          Select two decks above to compare them.
        </div>
      )}
    </div>
  );
}
