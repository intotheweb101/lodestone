'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { actionCloneDeck } from '@/app/actions';

export function CloneDeckButton({ deckId }: { deckId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault(); // don't navigate to the deck
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      const result = await actionCloneDeck(deckId);
      if (result?.id) router.push(`/decks/${result.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title="Duplicate deck"
      style={{
        padding: '5px 10px',
        borderRadius: '7px',
        background: 'transparent',
        border: '1px solid var(--border)',
        color: 'var(--text-faint)',
        cursor: loading ? 'wait' : 'pointer',
        fontSize: '11px',
        fontFamily: "'IBM Plex Sans', sans-serif",
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        flexShrink: 0,
        transition: 'border-color 0.15s, color 0.15s',
      }}
      onMouseEnter={e => {
        if (!loading) {
          e.currentTarget.style.borderColor = 'var(--accent)';
          e.currentTarget.style.color = 'var(--accent)';
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.color = 'var(--text-faint)';
      }}
    >
      {loading ? '…' : '⊕ Duplicate'}
    </button>
  );
}
