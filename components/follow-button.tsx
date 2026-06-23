'use client';

import { useTransition, useState } from 'react';
import { actionToggleFollow } from '@/app/actions';

export function FollowButton({
  targetUserId,
  initialFollowing,
  followerCount: initialCount,
}: {
  targetUserId: string;
  initialFollowing: boolean;
  followerCount: number;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      try {
        const result = await actionToggleFollow(targetUserId);
        setFollowing(result.following);
        setCount(c => c + (result.following ? 1 : -1));
      } catch {}
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      style={{
        padding: '6px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
        border: following ? '1px solid var(--border)' : '1px solid var(--accent)',
        background: following ? 'var(--surface-2)' : 'var(--accent)',
        color: following ? 'var(--text-muted)' : '#0a1f22',
        cursor: pending ? 'default' : 'pointer',
        opacity: pending ? 0.7 : 1,
        fontFamily: "'IBM Plex Sans', sans-serif",
        transition: 'background 0.12s, border-color 0.12s',
      }}
    >
      {following ? `Following (${count})` : `Follow (${count})`}
    </button>
  );
}
