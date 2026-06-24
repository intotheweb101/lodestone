'use client';
import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { actionSetForTrade } from '@/app/actions';

interface Entry {
  oracle_id: string;
  card_name: string;
  quantity: number;
  foil: boolean;
  for_trade?: boolean;
}

interface Props {
  entries: Entry[];
}

type BulkAction = 'delete' | 'trade' | 'qty';

function entryKey(e: { oracle_id: string; foil: boolean }) {
  return `${e.oracle_id}:${e.foil ? '1' : '0'}`;
}

export function BulkActions({ entries }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<BulkAction | null>(null);
  const [newQty, setNewQty] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [filter, setFilter] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return q ? entries.filter(e => e.card_name.toLowerCase().includes(q)) : entries;
  }, [entries, filter]);

  const allKeys = filtered.map(entryKey);
  const allSelected = allKeys.length > 0 && allKeys.every(k => selected.has(k));

  function toggle(e: Entry) {
    const k = entryKey(e);
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
    setConfirmDelete(false);
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allKeys));
    }
    setConfirmDelete(false);
  }

  function getSelectedEntries() {
    return entries.filter(e => selected.has(entryKey(e)));
  }

  function applyAction() {
    const sel = getSelectedEntries();
    if (sel.length === 0) return;

    startTransition(async () => {
      if (action === 'delete') {
        for (const e of sel) {
          await fetch('/api/collection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oracle_id: e.oracle_id, quantity: 0, foil: e.foil }),
          });
        }
      } else if (action === 'trade') {
        const anyForTrade = sel.some(e => e.for_trade);
        for (const e of sel) {
          await actionSetForTrade(e.oracle_id, !anyForTrade);
        }
      } else if (action === 'qty') {
        for (const e of sel) {
          await fetch('/api/collection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oracle_id: e.oracle_id, quantity: newQty, foil: e.foil }),
          });
        }
      }
      setSelected(new Set());
      setAction(null);
      setConfirmDelete(false);
      router.refresh();
    });
  }

  const mono = { fontFamily: "'IBM Plex Mono', monospace" } as const;
  const btnBase = {
    padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', border: '1px solid var(--border)',
    background: 'var(--surface-2)', color: 'var(--text-muted)',
    fontFamily: "'IBM Plex Sans', sans-serif",
    transition: 'all 0.1s',
  } as const;

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={() => { setOpen(v => !v); setSelected(new Set()); setAction(null); }}
        style={{
          ...btnBase,
          background: open ? 'rgba(232,177,74,0.1)' : 'var(--surface)',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          color: open ? 'var(--accent)' : 'var(--text-muted)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M4 6l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Bulk actions
      </button>

      {open && (
        <div style={{
          marginTop: 8, background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '14px 16px',
        }}>
          {/* Search + select all row */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter cards…"
              style={{
                flex: 1, minWidth: 120, background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '5px 10px', fontSize: 12, color: 'var(--text)',
                fontFamily: "'IBM Plex Sans', sans-serif", outline: 'none',
              }}
            />
            <button onClick={toggleAll} style={btnBase}>
              {allSelected ? 'Clear all' : `Select all (${filtered.length})`}
            </button>
            {selected.size > 0 && (
              <span style={{ ...mono, fontSize: 11, color: 'var(--accent)', alignSelf: 'center' }}>
                {selected.size} selected
              </span>
            )}
          </div>

          {/* Card list */}
          <div style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 12, borderRadius: 6, border: '1px solid var(--border)' }}>
            {filtered.slice(0, 200).map(e => {
              const k = entryKey(e);
              const checked = selected.has(k);
              return (
                <label key={k} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', cursor: 'pointer',
                  background: checked ? 'rgba(232,177,74,0.06)' : 'transparent',
                  borderBottom: '1px solid var(--border)',
                  userSelect: 'none',
                }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(e)}
                    style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0 }}
                  />
                  <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.card_name}
                  </span>
                  {e.foil && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: 'linear-gradient(120deg,#7b6bd6,#d67ba8,#e8b14a)', color: '#fff' }}>
                      FOIL
                    </span>
                  )}
                  {e.for_trade && (
                    <span style={{ ...mono, fontSize: 9, color: '#54c08a' }}>trade</span>
                  )}
                  <span style={{ ...mono, fontSize: 11, color: 'var(--text-faint)', flexShrink: 0 }}>×{e.quantity}</span>
                </label>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: '16px', fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>
                No cards match.
              </div>
            )}
          </div>

          {/* Action buttons */}
          {selected.size > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                onClick={() => { setAction('trade'); setConfirmDelete(false); }}
                style={{ ...btnBase, ...(action === 'trade' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}) }}
              >
                Toggle for trade
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={() => { setAction('qty'); setConfirmDelete(false); }}
                  style={{ ...btnBase, ...(action === 'qty' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}) }}
                >
                  Set qty
                </button>
                {action === 'qty' && (
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={newQty}
                    onChange={e => setNewQty(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                    style={{
                      width: 48, background: 'var(--bg)', border: '1px solid var(--accent)',
                      borderRadius: 5, padding: '4px 6px', fontSize: 12, color: 'var(--text)',
                      ...mono, outline: 'none', textAlign: 'center',
                    }}
                  />
                )}
              </div>

              <button
                onClick={() => { setAction('delete'); setConfirmDelete(false); }}
                style={{ ...btnBase, ...(action === 'delete' ? { borderColor: '#e2645c', color: '#e2645c' } : {}) }}
              >
                Delete
              </button>

              {action && !confirmDelete && (
                <button
                  onClick={() => {
                    if (action === 'delete') { setConfirmDelete(true); return; }
                    applyAction();
                  }}
                  disabled={isPending}
                  style={{
                    ...btnBase,
                    background: action === 'delete' ? 'rgba(226,100,92,0.12)' : 'var(--accent)',
                    borderColor: action === 'delete' ? '#e2645c' : 'var(--accent)',
                    color: action === 'delete' ? '#e2645c' : '#0a1f22',
                    opacity: isPending ? 0.6 : 1,
                  }}
                >
                  {isPending ? 'Working…' : `Apply to ${selected.size} card${selected.size !== 1 ? 's' : ''}`}
                </button>
              )}

              {confirmDelete && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#e2645c' }}>
                    Delete {selected.size} cards permanently?
                  </span>
                  <button
                    onClick={applyAction}
                    disabled={isPending}
                    style={{ ...btnBase, background: 'rgba(226,100,92,0.12)', borderColor: '#e2645c', color: '#e2645c' }}
                  >
                    {isPending ? 'Deleting…' : 'Confirm delete'}
                  </button>
                  <button onClick={() => setConfirmDelete(false)} style={btnBase}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
