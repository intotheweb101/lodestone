/**
 * LegalityBadge — shows a green/amber chip based on isLegal() output.
 * Server-friendly (no 'use client' needed).
 */

interface Props {
  legal: boolean;
  reason: string | null;
  /** Optional size variant (defaults to 'sm') */
  size?: 'sm' | 'md';
}

export function LegalityBadge({ legal, reason, size = 'sm' }: Props) {
  const fontSize = size === 'md' ? '12px' : '11px';
  const padding = size === 'md' ? '4px 10px' : '3px 8px';

  if (legal) {
    return (
      <span
        title="Deck is legal for this format"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          background: 'rgba(84,192,138,0.12)', border: '1px solid rgba(84,192,138,0.35)',
          color: '#7fd6a6', borderRadius: '20px',
          fontSize, padding,
          fontFamily: "'IBM Plex Mono', monospace",
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#54c08a', flexShrink: 0 }} />
        Legal
      </span>
    );
  }

  return (
    <span
      title={reason ?? 'Deck is not legal'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        background: 'rgba(240,207,91,0.10)', border: '1px solid rgba(240,207,91,0.35)',
        color: '#e6ce7a', borderRadius: '20px',
        fontSize, padding,
        fontFamily: "'IBM Plex Mono', monospace",
        fontWeight: 600,
        whiteSpace: 'nowrap',
        cursor: reason ? 'help' : 'default',
      }}
    >
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#f0cf5b', flexShrink: 0 }} />
      {reason ? reason.split('(')[0].trim() : 'Not legal'}
    </span>
  );
}
