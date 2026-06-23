'use client';
/**
 * CommentForm — compose box for posting a comment or reply on a deck.
 * Calls actionAddComment (server action). Requires real account.
 */
import { useState, useTransition } from 'react';
import { actionAddComment } from '@/app/actions';

interface CommentFormProps {
  deckId: string;
  parentId?: string;
  placeholder?: string;
  onSuccess?: () => void;
}

export function CommentForm({ deckId, parentId, placeholder = 'Write a comment…', onSuccess }: CommentFormProps) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setError(null);

    startTransition(async () => {
      try {
        await actionAddComment(deckId, body, parentId);
        setBody('');
        onSuccess?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to post comment.');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder={placeholder}
        rows={3}
        disabled={pending}
        style={{
          width: '100%',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          color: 'var(--text)',
          fontFamily: "'IBM Plex Sans', sans-serif",
          fontSize: '13.5px',
          lineHeight: 1.5,
          padding: '10px 12px',
          resize: 'vertical',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {error && (
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--red)' }}>{error}</p>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="submit"
          disabled={pending || !body.trim()}
          style={{
            padding: '7px 18px',
            borderRadius: '7px',
            background: 'var(--accent)',
            color: '#0a1f22',
            border: 'none',
            cursor: pending || !body.trim() ? 'default' : 'pointer',
            fontSize: '12.5px',
            fontWeight: 700,
            fontFamily: "'IBM Plex Sans', sans-serif",
            opacity: pending || !body.trim() ? 0.5 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {pending ? 'Posting…' : parentId ? 'Reply' : 'Post comment'}
        </button>
      </div>
    </form>
  );
}
