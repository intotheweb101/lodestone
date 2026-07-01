'use client';
import { useTransition } from 'react';
import { actionDeleteComment } from '@/app/actions';

interface Props {
  commentId: string;
}

export function CommentDeleteButton({ commentId }: Props) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm('Delete this comment?')) return;
    startTransition(async () => {
      try {
        await actionDeleteComment(commentId);
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Delete failed');
      }
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={pending}
      title="Delete comment"
      style={{
        background: 'none', border: 'none', cursor: pending ? 'wait' : 'pointer',
        color: 'var(--text-faint)', fontSize: 11, padding: '0 4px',
        opacity: pending ? 0.5 : 0.6, lineHeight: 1,
      }}
    >
      ✕
    </button>
  );
}
