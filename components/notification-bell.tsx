'use client';

import { useState, useTransition } from 'react';
import { actionMarkAllRead } from '@/app/actions';
import type { Notification } from '@/lib/social/store';

export function NotificationBell({
  notifications,
  unreadCount: initialUnread,
}: {
  notifications: Notification[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [pending, startTransition] = useTransition();

  function handleOpen() {
    setOpen(v => !v);
    if (!open && unread > 0) {
      startTransition(async () => {
        await actionMarkAllRead();
        setUnread(0);
      });
    }
  }

  const typeLabel: Record<string, string> = {
    like: 'liked your deck',
    comment: 'commented on your deck',
    follow: 'started following you',
    price: '🔔 Price alert:',
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={handleOpen}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        style={{
          position: 'relative', background: 'none', border: 'none',
          cursor: 'pointer', padding: '4px 6px', color: 'var(--text-faint)',
          display: 'flex', alignItems: 'center',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0,
            minWidth: 14, height: 14, borderRadius: 7,
            background: 'var(--accent)', color: '#0a1f22',
            fontSize: 9, fontWeight: 700, lineHeight: '14px',
            textAlign: 'center', padding: '0 2px',
            fontFamily: "'IBM Plex Mono', monospace",
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 6,
          width: 300, maxHeight: 400, overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          zIndex: 100,
        }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase' }}>
              Notifications
            </span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 14 }}>×</button>
          </div>
          {notifications.length === 0 ? (
            <div style={{ padding: '24px 14px', color: 'var(--text-faint)', fontSize: 13, textAlign: 'center' }}>
              No notifications yet.
            </div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                style={{
                  padding: '10px 14px', borderBottom: '1px solid var(--border)',
                  background: n.read ? 'transparent' : 'rgba(84,192,138,0.04)',
                  fontSize: 12.5, color: 'var(--text)',
                }}
              >
                <span style={{ fontWeight: 600 }}>{n.actor_name}</span>{' '}
                <span style={{ color: 'var(--text-faint)' }}>{typeLabel[n.type] ?? n.type}</span>
                {n.type === 'price' && n.note_text && (
                  <span style={{ color: 'var(--text-muted)' }}> {n.note_text}</span>
                )}
                {n.type !== 'price' && n.deck_name && (
                  <span style={{ color: 'var(--text-muted)' }}>: {n.deck_name}</span>
                )}
                <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 2, fontFamily: "'IBM Plex Mono', monospace" }}>
                  {new Date(n.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
