'use client';
/**
 * CardUpvoteButton — optimistic upvote toggle for a card (oracle_id scoped).
 * Mirrors LikeButton but calls actionToggleCardUpvote.
 */
import { useState, useTransition } from 'react';
import { actionToggleCardUpvote } from '@/app/actions';

interface CardUpvoteButtonProps {
  oracleId: string;
  initialCount: number;
  initialUpvoted: boolean;
  isLoggedIn: boolean;
}

export function CardUpvoteButton({ oracleId, initialCount, initialUpvoted, isLoggedIn }: CardUpvoteButtonProps) {
  const [upvoted, setUpvoted] = useState(initialUpvoted);
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!isLoggedIn) {
      window.location.href = '/login';
      return;
    }
    const next = !upvoted;
    setUpvoted(next);
    setCount(c => c + (next ? 1 : -1));

    startTransition(async () => {
      try {
        const result = await actionToggleCardUpvote(oracleId);
        setUpvoted(result.upvoted);
      } catch {
        setUpvoted(!next);
        setCount(c => c + (next ? -1 : 1));
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      title={isLoggedIn ? (upvoted ? 'Remove upvote' : 'Upvote this card') : 'Sign in to upvote'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '5px 12px',
        borderRadius: '8px',
        border: upvoted ? '1px solid rgba(232,177,74,0.5)' : '1px solid var(--border)',
        background: upvoted ? 'rgba(232,177,74,0.1)' : 'var(--surface)',
        cursor: pending ? 'default' : 'pointer',
        color: upvoted ? 'var(--accent)' : 'var(--text-muted)',
        fontSize: '13px',
        fontWeight: upvoted ? 600 : 400,
        fontFamily: "'IBM Plex Sans', sans-serif",
        transition: 'all 0.15s ease',
        opacity: pending ? 0.7 : 1,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill={upvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
        <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
      </svg>
      {count > 0 ? count : 'Upvote'}
    </button>
  );
}
