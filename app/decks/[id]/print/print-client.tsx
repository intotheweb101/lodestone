'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CardSlot } from './page';

// 9 cards per Letter/A4 sheet at 2.5" × 3.5"
const CARDS_PER_PAGE = 9;

interface Props {
  deckName: string;
  format: string;
  mainCards: CardSlot[];
  sideCards: CardSlot[];
}

export function PrintClient({ deckName, format, mainCards, sideCards }: Props) {
  const [includeSide, setIncludeSide] = useState(false);
  const [textOnly, setTextOnly] = useState(false);

  const visible = includeSide ? [...mainCards, ...sideCards] : mainCards;
  const pageCount = Math.max(1, Math.ceil(visible.length / CARDS_PER_PAGE));

  return (
    <>
      {/* ── Print stylesheet ── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          html, body { margin: 0; padding: 0; background: white !important; }
          .print-grid {
            display: grid !important;
            grid-template-columns: repeat(3, 2.5in) !important;
            column-gap: 0.1in !important;
            row-gap: 0.1in !important;
            padding: 0.2in !important;
            background: white !important;
          }
          .proxy-card {
            width: 2.5in !important;
            height: 3.5in !important;
            border-radius: 0.12in !important;
            overflow: hidden !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .proxy-card img {
            display: block !important;
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            object-position: top !important;
          }
          .proxy-text {
            width: 100% !important;
            height: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 0.1in !important;
            box-sizing: border-box !important;
            background: white !important;
            border: 1px solid #ccc !important;
          }
        }
      `}</style>

      <div style={{ minHeight: '100vh', background: 'var(--bg, #07151a)', color: 'var(--text, #c8dbd8)' }}>

        {/* ── Controls bar (hidden when printing) ── */}
        <div className="no-print" style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: 'var(--surface, #0d2426)', borderBottom: '1px solid var(--border, #1e3e3a)',
          padding: '10px 20px',
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          {/* Back link — uses browser history so it works with the deck builder tab */}
          <Link
            href=".."
            style={{ fontSize: 12, color: 'var(--text-faint, #557570)', textDecoration: 'none' }}
          >
            ← Back
          </Link>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'var(--accent, #e8b14a)', fontWeight: 700 }}>
              {deckName}
            </span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'var(--text-faint, #557570)', textTransform: 'capitalize' }}>
              {format}
            </span>
          </div>

          <span style={{ fontSize: 11, color: 'var(--text-faint, #557570)', fontFamily: "'IBM Plex Mono', monospace" }}>
            {mainCards.length} main{sideCards.length > 0 ? ` · ${sideCards.length} side` : ''}
          </span>

          {/* Toggles */}
          {sideCards.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-faint, #557570)', cursor: 'pointer' }}>
              <input type="checkbox" checked={includeSide} onChange={e => setIncludeSide(e.target.checked)} style={{ accentColor: 'var(--accent, #e8b14a)' }} />
              Include sideboard ({sideCards.length})
            </label>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-faint, #557570)', cursor: 'pointer' }}>
            <input type="checkbox" checked={textOnly} onChange={e => setTextOnly(e.target.checked)} style={{ accentColor: 'var(--accent, #e8b14a)' }} />
            Text only
          </label>

          {/* Page count + Print button */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text-faint, #557570)', fontFamily: "'IBM Plex Mono', monospace" }}>
              {visible.length} cards · {pageCount} page{pageCount !== 1 ? 's' : ''}
            </span>
            <button
              onClick={() => window.print()}
              style={{
                padding: '7px 18px', borderRadius: 7,
                background: 'var(--accent, #e8b14a)', color: '#0a1f22',
                border: 'none', fontWeight: 700, fontSize: 13,
                cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif",
              }}
            >
              🖨 Print
            </button>
          </div>
        </div>

        {/* ── Card grid ── */}
        <div
          className="print-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
            gap: 10,
            padding: '20px',
          }}
        >
          {visible.map((card, i) => (
            <div
              key={i}
              className="proxy-card"
              style={{
                width: 175,
                height: 244,
                borderRadius: 9,
                overflow: 'hidden',
                border: card.isCommander
                  ? '2px solid var(--accent, #e8b14a)'
                  : '1px solid var(--border, #1e3e3a)',
                flexShrink: 0,
                position: 'relative',
                background: 'var(--surface, #0d2426)',
              }}
            >
              {card.imageUrl && !textOnly ? (
                <img
                  src={card.imageUrl}
                  alt={card.name}
                  style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
                  loading="lazy"
                />
              ) : (
                <div className="proxy-text" style={{
                  width: '100%', height: '100%',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  padding: 12, boxSizing: 'border-box',
                  background: '#0e2426',
                  gap: 8,
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid var(--border, #1e3e3a)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div style={{
                    fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: 12,
                    color: 'var(--text, #c8dbd8)', textAlign: 'center', lineHeight: 1.4,
                  }}>
                    {card.name}
                  </div>
                  {card.isCommander && (
                    <div style={{ fontSize: 8, color: 'var(--accent, #e8b14a)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1 }}>
                      COMMANDER
                    </div>
                  )}
                </div>
              )}

              {/* Commander badge overlay */}
              {card.isCommander && card.imageUrl && !textOnly && (
                <div style={{
                  position: 'absolute', top: 4, right: 4,
                  background: 'rgba(7,21,26,0.88)',
                  border: '1px solid rgba(232,177,74,0.6)',
                  borderRadius: 4, padding: '1px 5px',
                  fontSize: 8, color: 'var(--accent, #e8b14a)',
                  fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, letterSpacing: 0.5,
                  pointerEvents: 'none',
                }}>
                  ⚜ CMD
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Printing tips ── */}
        {visible.length > 0 && (
          <div className="no-print" style={{
            margin: '0 20px 40px',
            padding: '12px 16px',
            background: 'var(--surface, #0d2426)',
            border: '1px solid var(--border, #1e3e3a)',
            borderRadius: 8, fontSize: 12,
            color: 'var(--text-faint, #557570)', lineHeight: 1.7,
            maxWidth: 620,
          }}>
            <strong style={{ color: 'var(--text, #c8dbd8)', display: 'block', marginBottom: 4 }}>Printing tips</strong>
            Cards print at 2.5" × 3.5" (standard playing card size), 9 per US Letter / A4 sheet.
            In the print dialog: set margins to <em>None</em>, disable headers &amp; footers, and
            enable <em>Background graphics</em>. Cut along card edges and slide in front of a basic land.
          </div>
        )}
      </div>
    </>
  );
}
