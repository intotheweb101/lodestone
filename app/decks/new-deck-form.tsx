'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { actionCreateDeck } from '@/app/actions';
import type { DeckFormat } from '@/lib/deck/model';

const FORMATS: DeckFormat[] = ['commander', 'standard', 'modern', 'pioneer', 'legacy', 'pauper'];

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '8px 12px',
  color: 'var(--text)',
  fontSize: '13px',
  outline: 'none',
  fontFamily: "'IBM Plex Sans', sans-serif",
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '10px',
  color: 'var(--text-faint)',
  marginBottom: '5px',
  letterSpacing: '1px',
  textTransform: 'uppercase',
};

export function NewDeckForm() {
  const [name, setName] = useState('');
  const [format, setFormat] = useState<DeckFormat>('commander');
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const { id } = await actionCreateDeck(name.trim(), format);
      router.push(`/decks/${id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <label style={labelStyle}>Deck name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Atraxa Superfriends"
            required
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Format</label>
          <select
            value={format}
            onChange={e => setFormat(e.target.value as DeckFormat)}
            style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}
          >
            {FORMATS.map(f => (
              <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={creating || !name.trim()}
          style={{
            padding: '9px 20px',
            background: 'var(--accent)',
            borderRadius: '10px',
            color: '#0a1f22',
            fontWeight: 700,
            fontSize: '13.5px',
            border: 'none',
            cursor: creating || !name.trim() ? 'not-allowed' : 'pointer',
            opacity: creating || !name.trim() ? 0.5 : 1,
            whiteSpace: 'nowrap',
            fontFamily: "'IBM Plex Sans', sans-serif",
          }}
        >
          {creating ? 'Creating…' : 'Create deck →'}
        </button>
      </div>
    </form>
  );
}
