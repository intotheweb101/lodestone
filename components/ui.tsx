'use client';

import React from 'react';
import { CardTooltip } from './card-tooltip';

// ── Mana pip ─────────────────────────────────────────────────────────────────

const MANA_COLORS: Record<string, string> = {
  W: '#f7efd2',
  U: '#a9def9',
  B: '#bcb4ad',
  R: '#f3a48b',
  G: '#93c8a6',
  C: '#c9c3bc',
  S: '#aad4e8',  // snow
  E: '#b0a0d8',  // energy
};

export function ManaIcon({ symbol, size = 18 }: { symbol: string; size?: number }) {
  const key = symbol.toUpperCase();

  // Hybrid mana: W/U, W/B, B/R, etc.
  if (key.includes('/') && !key.endsWith('/P')) {
    const [a, b] = key.split('/');
    const bgA = MANA_COLORS[a] ?? '#c9c3bc';
    const bgB = MANA_COLORS[b] ?? '#c9c3bc';
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '50%',
        background: `linear-gradient(135deg, ${bgA} 50%, ${bgB} 50%)`,
        border: '1px solid rgba(0,0,0,0.25)',
        flexShrink: 0,
        boxShadow: 'inset 0 -2px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.4)',
      }} title={key} />
    );
  }

  // Phyrexian mana: W/P, U/P, etc.
  if (key.endsWith('/P')) {
    const color = key.slice(0, -2);
    const bg = MANA_COLORS[color] ?? '#c9c3bc';
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '50%',
        background: bg, border: '1px solid rgba(0,0,0,0.25)',
        fontSize: Math.round(size * 0.45), fontWeight: 900, color: '#0a1820',
        flexShrink: 0, lineHeight: 1,
        boxShadow: 'inset 0 -2px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.4)',
      }} title={key}>Φ</span>
    );
  }

  // Numeric or X/Y/Z generic mana
  const isGeneric = /^(\d+|X|Y|Z)$/.test(key);
  if (isGeneric) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '50%',
        background: '#8b7d6b',
        border: '1px solid rgba(0,0,0,0.25)',
        fontSize: Math.round(size * (key.length > 1 ? 0.42 : 0.5)), fontWeight: 700, color: '#f4ede0',
        flexShrink: 0, lineHeight: 1,
        boxShadow: 'inset 0 -2px 3px rgba(0,0,0,0.28), 0 1px 2px rgba(0,0,0,0.4)',
      }}>
        {key}
      </span>
    );
  }

  // Named single symbols (W, U, B, R, G, C, S, T, etc.)
  const bg = MANA_COLORS[key] ?? '#c9c3bc';
  const isDark = key === 'W' || key === 'C' || key === 'B' || key === 'S';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: '50%',
      background: bg,
      border: '1px solid rgba(0,0,0,0.2)',
      fontSize: Math.round(size * 0.5), fontWeight: 700,
      color: isDark ? '#1a2e2a' : '#0a1820',
      flexShrink: 0, lineHeight: 1,
      boxShadow: 'inset 0 -2px 3px rgba(0,0,0,0.28), 0 1px 2px rgba(0,0,0,0.4)',
    }}>
      {key === 'T' ? '⤵' : key === 'Q' ? '⤴' : key}
    </span>
  );
}

// ── Card thumbnail ────────────────────────────────────────────────────────────

export function CardImage({ src, alt, width = 80 }: { src: string | null; alt: string; width?: number }) {
  const height = Math.round(width * (7 / 5));
  if (!src) {
    return (
      <div style={{
        width, height, borderRadius: 6, background: 'var(--surface-2)',
        border: '1px solid var(--border)', flexShrink: 0,
      }} aria-label="No image" />
    );
  }
  return (
    <img src={src} alt={alt} width={width} height={height}
      loading="lazy"
      style={{ borderRadius: 6, border: '1px solid var(--border)', flexShrink: 0, display: 'block' }}
    />
  );
}

// ── Condition badge ───────────────────────────────────────────────────────────

const CONDITION_COLORS: Record<string, string> = {
  'near mint': '#54c08a', nm: '#54c08a',
  'lightly played': '#a9c0ba', lp: '#a9c0ba',
  'moderately played': '#e8b14a', mp: '#e8b14a',
  'heavily played': '#e2645c', hp: '#e2645c',
  damaged: '#e2645c', dmg: '#e2645c',
};

export function ConditionBadge({ condition }: { condition: string }) {
  const key = condition.toLowerCase().trim();
  const color = CONDITION_COLORS[key] ?? 'var(--text-faint)';
  const abbrev = key === 'near mint' ? 'NM'
    : key === 'lightly played' ? 'LP'
    : key === 'moderately played' ? 'MP'
    : key === 'heavily played' ? 'HP'
    : condition.slice(0, 2).toUpperCase();

  return (
    <span style={{
      display: 'inline-block', padding: '1px 5px', borderRadius: '3px',
      fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.03em',
      background: `${color}20`, color, border: `1px solid ${color}40`,
    }} title={condition}>
      {abbrev}
    </span>
  );
}

// ── Confidence badge ──────────────────────────────────────────────────────────

export function ConfidenceBadge({ confidence }: { confidence: string }) {
  const styles: Record<string, { bg: string; border: string; color: string; dot: string }> = {
    exact:    { bg: 'rgba(84,192,138,0.12)', border: 'rgba(84,192,138,0.4)',  color: '#7fd6a6', dot: '#54c08a' },
    probable: { bg: 'rgba(240,207,91,0.10)', border: 'rgba(240,207,91,0.38)', color: '#e6ce7a', dot: '#f0cf5b' },
    weak:     { bg: 'rgba(224,145,58,0.10)', border: 'rgba(224,145,58,0.35)', color: '#d4955a', dot: '#e0913a' },
    none:     { bg: 'rgba(226,100,92,0.10)', border: 'rgba(226,100,92,0.35)', color: '#d07070', dot: '#e2645c' },
  };
  const s = styles[confidence] ?? styles.none;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      background: s.bg, border: `1px solid ${s.border}`,
      color: s.color, fontSize: '11px', padding: '3px 8px', borderRadius: '20px',
      fontFamily: "'IBM Plex Mono', monospace",
    }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {confidence}
    </span>
  );
}

// ── Price tag ─────────────────────────────────────────────────────────────────

export function PriceTag({ price, highlight = false }: { price: number; highlight?: boolean }) {
  return (
    <span className="mono" style={{
      fontWeight: 600, fontSize: 'var(--text-base)',
      color: highlight ? 'var(--green)' : 'var(--text)',
    }}>
      ${price.toFixed(2)}
    </span>
  );
}

// ── Deck entry row ────────────────────────────────────────────────────────────

export function DeckEntryRow({
  name,
  quantity,
  typeLine,
  colorIdentity,
  imageUrl,
  hoverImageUrl,
  manaCost,
  treatment,
  bestPrice,
  owned,
  onToggleOwned,
  onCardClick,
  onRemove,
  onEdit,
  onSetCommander,
  onAddToWishlist,
}: {
  name: string;
  quantity: number;
  typeLine?: string | null;
  colorIdentity?: string[];
  imageUrl?: string | null;
  hoverImageUrl?: string | null;
  manaCost?: string | null;
  treatment?: string;
  bestPrice?: number | null;
  owned?: boolean;
  onToggleOwned?: () => void;
  onCardClick?: () => void;
  onRemove?: () => void;
  onEdit?: () => void;
  onSetCommander?: () => void;
  onAddToWishlist?: () => void;
}) {
  const hasImage = Boolean(imageUrl);
  return (
    <div style={{
      height: hasImage ? '52px' : '34px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: hasImage ? '4px 8px 4px 4px' : '0 8px 0 6px',
      background: owned ? 'rgba(84,192,138,0.06)' : '#0e2426',
      border: `1px solid ${owned ? 'rgba(84,192,138,0.22)' : '#143230'}`,
      borderRadius: '7px',
      transition: 'background 0.15s, border-color 0.15s',
    }}>

      {/* Card thumbnail */}
      {hasImage && (
        <img
          src={imageUrl!}
          alt={name}
          onClick={onCardClick}
          style={{
            height: '44px', width: '31px', borderRadius: '4px', flexShrink: 0,
            border: '1px solid rgba(255,255,255,0.1)',
            cursor: onCardClick ? 'pointer' : 'default',
            objectFit: 'cover', objectPosition: 'top',
          }}
        />
      )}

      {/* Own/need toggle */}
      <button
        onClick={onToggleOwned}
        title={owned ? 'Mark as needed' : 'Mark as owned'}
        style={{
          width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
          border: `1.5px solid ${owned ? '#54c08a' : '#2a5450'}`,
          background: owned ? 'rgba(84,192,138,0.18)' : 'transparent',
          cursor: onToggleOwned ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0, transition: 'all 0.15s',
        }}
      >
        {owned ? (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#54c08a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : (
          <svg width="6" height="6" viewBox="0 0 6 6">
            <circle cx="3" cy="3" r="2" fill="#2a5450"/>
          </svg>
        )}
      </button>

      {/* Quantity */}
      <span style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontWeight: 500, fontSize: '12px',
        color: '#5f7a76', flexShrink: 0, minWidth: '18px',
      }}>
        {quantity}×
      </span>

      {/* Card name — clickable; tooltip on hover when image URL is available */}
      <span
        onClick={onCardClick}
        title={onCardClick ? `View ${name}` : undefined}
        style={{
          fontWeight: 600, fontSize: '13px', flex: 1, minWidth: 0,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          color: owned ? '#a8dfc4' : 'var(--text)',
          cursor: onCardClick ? 'pointer' : 'default',
        }}
      >
        <CardTooltip imageUrl={imageUrl ?? hoverImageUrl}>{name}</CardTooltip>
      </span>

      {/* Treatment badge */}
      {treatment && treatment !== 'normal' && (
        <span style={{
          fontSize: '10px', padding: '1px 5px',
          background: 'rgba(232,177,74,0.12)', color: 'var(--accent)',
          borderRadius: '3px', whiteSpace: 'nowrap',
          border: '1px solid rgba(232,177,74,0.28)',
          fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0,
        }}>
          {treatment}
        </span>
      )}

      {/* Price */}
      {bestPrice != null ? (
        <span style={{
          fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', fontWeight: 600,
          color: '#7fd6a6', flexShrink: 0,
        }}>
          ${bestPrice.toFixed(2)}
        </span>
      ) : (
        <span style={{ fontSize: '11px', color: 'var(--text-faint)', flexShrink: 0 }}>—</span>
      )}

      {/* Add to wishlist */}
      {onAddToWishlist && (
        <button onClick={onAddToWishlist} title="Add to wishlist" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-faint)', padding: '2px 3px', flexShrink: 0, lineHeight: 1,
          opacity: 0.55,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
      )}

      {/* Set commander */}
      {onSetCommander && (
        <button onClick={onSetCommander} title="Set as commander" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-faint)', fontSize: '13px', padding: '2px 3px', flexShrink: 0, lineHeight: 1,
          opacity: 0.5,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 20h20M5 20V10l7-7 7 7v10"/>
            <path d="M9 20v-5h6v5"/>
          </svg>
        </button>
      )}

      {/* Edit */}
      {onEdit && (
        <button onClick={onEdit} title="Change printing / version" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-faint)', fontSize: '13px', padding: '2px 3px', flexShrink: 0, lineHeight: 1,
          opacity: 0.6,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      )}

      {/* Remove */}
      {onRemove && (
        <button onClick={onRemove} title="Remove" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-faint)', fontSize: '15px', padding: '2px', flexShrink: 0, lineHeight: 1,
        }}>×</button>
      )}
    </div>
  );
}

// ── Button ────────────────────────────────────────────────────────────────────

export function Btn({
  children, onClick, variant = 'primary', size = 'md', disabled, type = 'button', style: extraStyle,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'gold';
  size?: 'sm' | 'md';
  disabled?: boolean;
  type?: 'button' | 'submit';
  style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: '0.375rem', cursor: disabled ? 'not-allowed' : 'pointer',
    border: 'none', borderRadius: '10px', fontWeight: 700,
    fontFamily: "'IBM Plex Sans', sans-serif",
    transition: 'opacity 0.15s', opacity: disabled ? 0.5 : 1,
    fontSize: size === 'sm' ? '12px' : '13.5px',
    padding: size === 'sm' ? '5px 10px' : '9px 16px',
    whiteSpace: 'nowrap',
  };
  const variants: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--accent)', color: '#0a1f22' },
    gold:    { background: 'var(--accent)', color: '#0a1f22' },
    ghost:   { background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' },
    danger:  { background: 'rgba(226,100,92,0.12)', color: 'var(--red)', border: '1px solid rgba(226,100,92,0.3)' },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...extraStyle }}>
      {children}
    </button>
  );
}
