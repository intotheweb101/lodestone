'use client';
/**
 * LikeButton — optimistic like/unlike toggle for a deck.
 * Requires a real logged-in account (not the 'local' sentinel).
 */
import { useState, useTransition } from 'react';
import { actionToggleLike } from '@/app/actions';

interface LikeButtonProps {
  deckId: string;
  initialCount: number;
  initialLiked: boolean;
  isLoggedIn: boolean;
}

export function LikeButton({ deckId, initialCount, initialLiked, isLoggedIn }: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!isLoggedIn) {
      window.location.href = '/login';
      return;
    }
    // Optimistic update
    const next = !liked;
    setLiked(next);
    setCount(c => c + (next ? 1 : -1));

    startTransition(async () => {
      try {
        const result = await actionToggleLike(deckId);
        // Reconcile with server truth
        setLiked(result.liked);
      } catch {
        // Roll back
        setLiked(!next);
        setCount(c => c + (next ? -1 : 1));
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      title={isLoggedIn ? (liked ? 'Unlike this deck' : 'Like this deck') : 'Sign in to like'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 14px',
        borderRadius: '8px',
        border: liked ? '1px solid rgba(232,100,92,0.5)' : '1px solid var(--border)',
        background: liked ? 'rgba(226,100,92,0.12)' : 'var(--surface)',
        cursor: pending ? 'default' : 'pointer',
        color: liked ? '#e2645c' : 'var(--text-muted)',
        fontSize: '13px',
        fontWeight: liked ? 600 : 400,
        fontFamily: "'IBM Plex Sans', sans-serif",
        transition: 'all 0.15s ease',
        opacity: pending ? 0.7 : 1,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
      {count > 0 ? count : 'Like'}
    </button>
  );
}
