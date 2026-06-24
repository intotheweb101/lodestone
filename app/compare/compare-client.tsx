'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface DeckOption {
  id: string;
  name: string;
  format: string | null;
  commander: string | null;
  card_count: number;
  visibility: string;
}

interface Props {
  decks: DeckOption[];
  initialA: string;
  initialB: string;
}

export function ComparePicker({ decks, initialA, initialB }: Props) {
  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialB);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function apply() {
    if (!a || !b || a === b) return;
    startTransition(() => {
      router.push(`/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
    });
  }

  function swap() {
    setA(b);
    setB(a);
    if (a && b && a !== b) {
      startTransition(() => {
        router.push(`/compare?a=${encodeURIComponent(b)}&b=${encodeURIComponent(a)}`);
      });
    }
  }

  const selectStyle = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text)',
    fontSize: '13px',
    padding: '8px 12px',
    flex: 1,
    minWidth: 0,
    fontFamily: "'IBM Plex Sans', sans-serif",
    cursor: 'pointer',
  } as const;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
      <select value={a} onChange={e => setA(e.target.value)} style={selectStyle}>
        <option value="">— Deck A —</option>
        {decks.map(d => (
          <option key={d.id} value={d.id}>
            {d.name}{d.format ? ` (${d.format})` : ''}{d.commander ? ` · ${d.commander}` : ''}
          </option>
        ))}
      </select>

      <button
        onClick={swap}
        title="Swap decks"
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '8px', padding: '8px 10px', cursor: 'pointer',
          color: 'var(--text-faint)', flexShrink: 0, fontSize: '14px',
          lineHeight: 1,
        }}
      >
        ⇄
      </button>

      <select value={b} onChange={e => setB(e.target.value)} style={selectStyle}>
        <option value="">— Deck B —</option>
        {decks.map(d => (
          <option key={d.id} value={d.id}>
            {d.name}{d.format ? ` (${d.format})` : ''}{d.commander ? ` · ${d.commander}` : ''}
          </option>
        ))}
      </select>

      <button
        onClick={apply}
        disabled={!a || !b || a === b}
        style={{
          padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
          cursor: a && b && a !== b ? 'pointer' : 'not-allowed',
          background: a && b && a !== b ? 'var(--accent)' : 'var(--surface)',
          border: `1px solid ${a && b && a !== b ? 'var(--accent)' : 'var(--border)'}`,
          color: a && b && a !== b ? '#0a1f22' : 'var(--text-faint)',
          flexShrink: 0,
          fontFamily: "'IBM Plex Sans', sans-serif",
          transition: 'all 0.12s',
        }}
      >
        Compare
      </button>
    </div>
  );
}
