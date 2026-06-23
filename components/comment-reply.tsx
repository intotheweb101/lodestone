'use client';

import { useState } from 'react';
import { CommentForm } from './comment-form';

export function CommentReplySection({ deckId, commentId }: { deckId: string; commentId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginTop: 6 }}>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 11, color: 'var(--text-faint)',
            padding: '2px 0', fontFamily: "'IBM Plex Sans', sans-serif",
          }}
        >
          ↩ Reply
        </button>
      )}
      {open && (
        <div style={{ marginTop: 8 }}>
          <CommentForm
            deckId={deckId}
            parentId={commentId}
            placeholder="Write a reply…"
            onSuccess={() => setOpen(false)}
          />
          <button
            onClick={() => setOpen(false)}
            style={{
              marginTop: 4, background: 'none', border: 'none',
              cursor: 'pointer', fontSize: 11, color: 'var(--text-faint)',
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
