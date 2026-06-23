'use client';

import { useState } from 'react';
import { actionDeleteDeck } from '@/app/actions';

export function DeleteDeckButton({ deckId, deckName }: { deckId: string; deckName: string }) {
  const [loading, setLoading] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    if (!confirm(`Delete "${deckName}"? This cannot be undone.`)) return;
    setLoading(true);
    try {
      await actionDeleteDeck(deckId);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title="Delete deck"
      style={{
        padding: '5px 10px',
        borderRadius: '7px',
        background: 'transparent',
        border: '1px solid rgba(226,100,92,0.25)',
        color: '#a05858',
        cursor: loading ? 'wait' : 'pointer',
        fontSize: '11px',
        fontFamily: "'IBM Plex Sans', sans-serif",
        fontWeight: 500,
        flexShrink: 0,
        transition: 'border-color 0.15s, color 0.15s',
      }}
      onMouseEnter={e => {
        if (!loading) {
          e.currentTarget.style.borderColor = '#e2645c';
          e.currentTarget.style.color = '#e2645c';
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(226,100,92,0.25)';
        e.currentTarget.style.color = '#a05858';
      }}
    >
      {loading ? '…' : '🗑'}
    </button>
  );
}
