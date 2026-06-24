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
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [pending, startTransition] = useTransition();

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = slug ? `${origin}/d/${slug}` : null;
  const embedUrl = slug ? `${origin}/embed/${slug}` : null;
  const embedCode = embedUrl
    ? `<iframe src="${embedUrl}" width="800" height="600" frameborder="0" style="border:none;background:#07151a;" allowtransparency="true" title="Lodestone deck embed"></iframe>`
    : null;

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

  function copyEmbed() {
    if (!embedCode) return;
    navigator.clipboard.writeText(embedCode).then(() => {
      setCopiedEmbed(true);
      setTimeout(() => setCopiedEmbed(false), 2500);
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
              <div style={{ marginBottom: '14px' }}>
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

            {/* Embed code */}
            {embedCode && (
              <div>
                <div style={{ fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: '6px' }}>
                  Embed
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    readOnly
                    value={embedCode}
                    style={{
                      flex: 1, background: 'var(--surface-3)', border: '1px solid var(--border)',
                      borderRadius: '6px', padding: '6px 10px', fontSize: '10px',
                      color: 'var(--text-muted)', fontFamily: "'IBM Plex Mono', monospace",
                      outline: 'none', overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    onFocus={e => e.target.select()}
                  />
                  <button
                    onClick={copyEmbed}
                    style={{
                      padding: '6px 12px', borderRadius: '6px',
                      background: copiedEmbed ? 'rgba(84,192,138,0.15)' : 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      color: copiedEmbed ? 'var(--green)' : 'var(--text-muted)',
                      cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                      fontFamily: "'IBM Plex Sans', sans-serif",
                      transition: 'all 0.15s',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {copiedEmbed ? '✓' : 'Copy'}
                  </button>
                </div>
                <a
                  href={embedUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'block', marginTop: '8px', fontSize: '11.5px', color: 'var(--text-faint)', textDecoration: 'none', fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  Preview embed ↗
                </a>
              </div>
            )}

            {/* QR code */}
            {shareUrl && (
              <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: '8px' }}>
                  QR code
                </div>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&bgcolor=07151a&color=e8b14a&data=${encodeURIComponent(shareUrl)}`}
                  alt="QR code for deck link"
                  width={140}
                  height={140}
                  style={{ display: 'block', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
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
