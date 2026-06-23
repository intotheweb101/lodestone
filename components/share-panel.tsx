'use client';
/**
 * SharePanel — deck visibility control + share link.
 * Rendered as a "Share" button that opens an inline panel.
 * Calls actionSetDeckVisibility (server action).
 */
import { useState, useTransition } from 'react';
import { actionSetDeckVisibility } from '@/app/actions';
import type { DeckVisibility } from '@/lib/deck/model';

interface SharePanelProps {
  deckId: string;
  initialVisibility: DeckVisibility;
  initialSlug: string | null;
}

const VISIBILITY_OPTIONS: { value: DeckVisibility; label: string; description: string }[] = [
  { value: 'private',  label: '🔒 Private',  description: 'Only you can see this deck.' },
  { value: 'unlisted', label: '🔗 Unlisted', description: 'Anyone with the link can view.' },
  { value: 'public',   label: '🌐 Public',   description: 'Listed on Browse and your profile.' },
];

export function SharePanel({ deckId, initialVisibility, initialSlug }: SharePanelProps) {
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState<DeckVisibility>(initialVisibility);
  const [slug, setSlug] = useState<string | null>(initialSlug);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const shareUrl = slug ? `${typeof window !== 'undefined' ? window.location.origin : ''}/d/${slug}` : null;

  function handleVisibilityChange(v: DeckVisibility) {
    if (v === visibility) return;
    startTransition(async () => {
      try {
        const result = await actionSetDeckVisibility(deckId, v);
        setVisibility(v);
        setSlug(result.public_slug);
      } catch {
        // ignore — revert would need optimistic rollback, keep it simple
      }
    });
  }

  function copyLink() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '6px 14px', borderRadius: '8px',
          border: '1px solid var(--border)',
          background: open ? 'var(--surface-2)' : 'var(--surface)',
          color: 'var(--text-muted)',
          cursor: 'pointer', fontSize: '12.5px', fontWeight: 500,
          fontFamily: "'IBM Plex Sans', sans-serif",
          transition: 'background 0.12s',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        Share
        {visibility !== 'private' && (
          <span style={{ fontSize: '10px', background: 'var(--accent-glow)', color: 'var(--accent)', padding: '1px 5px', borderRadius: 4 }}>
            {visibility === 'public' ? 'Public' : 'Unlisted'}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />
          {/* Panel */}
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: '300px', zIndex: 201,
            background: 'var(--surface)', border: '1px solid var(--border-2)',
            borderRadius: '12px', padding: '16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <div style={{ fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: '12px' }}>
              Deck visibility
            </div>

            {/* Visibility options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
              {VISIBILITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleVisibilityChange(opt.value)}
                  disabled={pending}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                    padding: '10px 12px', borderRadius: '8px',
                    border: visibility === opt.value ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: visibility === opt.value ? 'var(--accent-glow)' : 'var(--surface-2)',
                    cursor: 'pointer', textAlign: 'left',
                    fontFamily: "'IBM Plex Sans', sans-serif",
                    opacity: pending ? 0.6 : 1,
                    transition: 'all 0.12s',
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: 600, color: visibility === opt.value ? 'var(--accent)' : 'var(--text)' }}>
                    {opt.label}
                  </span>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-faint)', marginTop: '2px' }}>
                    {opt.description}
                  </span>
                </button>
              ))}
            </div>

            {/* Share link */}
            {shareUrl && (
              <div>
                <div style={{ fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: '6px' }}>
                  Share link
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    readOnly
                    value={shareUrl}
                    style={{
                      flex: 1, background: 'var(--surface-3)', border: '1px solid var(--border)',
                      borderRadius: '6px', padding: '6px 10px', fontSize: '11px',
                      color: 'var(--text-muted)', fontFamily: "'IBM Plex Mono', monospace",
                      outline: 'none',
                    }}
                    onFocus={e => e.target.select()}
                  />
                  <button
                    onClick={copyLink}
                    style={{
                      padding: '6px 12px', borderRadius: '6px',
                      background: copied ? 'rgba(84,192,138,0.15)' : 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      color: copied ? 'var(--green)' : 'var(--text-muted)',
                      cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                      fontFamily: "'IBM Plex Sans', sans-serif",
                      transition: 'all 0.15s',
                    }}
                  >
                    {copied ? '✓' : 'Copy'}
                  </button>
                </div>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'block', marginTop: '8px', fontSize: '11.5px', color: 'var(--accent)', textDecoration: 'none', fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  Open public page ↗
                </a>
              </div>
            )}

            {pending && (
              <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-faint)', textAlign: 'center' }}>Saving…</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
