'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface ProxyCard {
  oracle_id: string;
  card_name: string;
  quantity: number;
  image_url: string | null;
}

interface Props {
  cards: ProxyCard[];
  deckName?: string;
  deckId?: string;
}

export function ProxyClient({ cards, deckName, deckId }: Props) {
  const router = useRouter();
  const [deckInput, setDeckInput] = useState(deckId ?? '');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(cards.map(c => c.oracle_id)));
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const c of cards) m[c.oracle_id] = c.quantity;
    return m;
  });

  const mono = "'IBM Plex Mono', monospace";
  const sans = "'IBM Plex Sans', sans-serif";

  const printCards: { oracle_id: string; card_name: string; image_url: string | null }[] = [];
  for (const c of cards) {
    if (!selected.has(c.oracle_id)) continue;
    const qty = quantities[c.oracle_id] ?? c.quantity;
    for (let i = 0; i < qty; i++) {
      printCards.push({ oracle_id: c.oracle_id + ':' + i, card_name: c.card_name, image_url: c.image_url });
    }
  }

  const totalCards = printCards.length;
  const pages = Math.ceil(totalCards / 9);

  function toggleAll(on: boolean) {
    setSelected(on ? new Set(cards.map(c => c.oracle_id)) : new Set());
  }

  function toggleCard(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function setQty(id: string, qty: number) {
    setQuantities(prev => ({ ...prev, [id]: Math.max(1, Math.min(9, qty)) }));
  }

  function loadDeck() {
    if (deckInput.trim()) router.push(`/proxy?deck=${encodeURIComponent(deckInput.trim())}`);
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)', fontFamily: sans }}>
      {/* Print styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .proxy-controls { display: none !important; }
          .proxy-screen-header { display: none !important; }
          .proxy-grid {
            display: grid !important;
            grid-template-columns: repeat(3, 63mm) !important;
            gap: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .proxy-card {
            width: 63mm !important;
            height: 88mm !important;
            break-inside: avoid;
            page-break-inside: avoid;
            border: none !important;
            border-radius: 0 !important;
          }
          .proxy-card img {
            width: 63mm !important;
            height: 88mm !important;
            object-fit: cover;
            display: block;
          }
          body { margin: 0; background: white; }
        }
      `}} />

      {/* Header */}
      <div className="proxy-screen-header" style={{
        borderBottom: '1px solid var(--border)',
        padding: '14px 24px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--surface)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <a href="/decks" style={{ color: 'var(--text-faint)', textDecoration: 'none', fontSize: 12 }}>← Decks</a>
        <span style={{ color: 'var(--border)' }}>/</span>
        <span style={{ fontFamily: mono, fontSize: 11, color: 'var(--accent)', letterSpacing: '1px', textTransform: 'uppercase' }}>
          Proxy Printer
        </span>
        {deckName && (
          <>
            <span style={{ color: 'var(--border)' }}>/</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{deckName}</span>
          </>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: mono, fontSize: 11, color: 'var(--text-faint)' }}>
            {totalCards} card{totalCards !== 1 ? 's' : ''} · {pages} page{pages !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => window.print()}
            disabled={totalCards === 0}
            style={{
              padding: '7px 18px', borderRadius: 8, fontWeight: 700, fontSize: 13,
              cursor: totalCards > 0 ? 'pointer' : 'not-allowed',
              background: totalCards > 0 ? 'var(--accent)' : 'var(--surface)',
              border: `1px solid ${totalCards > 0 ? 'var(--accent)' : 'var(--border)'}`,
              color: totalCards > 0 ? '#0a1f22' : 'var(--text-faint)',
              fontFamily: sans,
            }}
          >
            Print
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100dvh - 56px)' }}>
        {/* Sidebar controls */}
        <div className="proxy-controls" style={{
          width: 240, flexShrink: 0,
          borderRight: '1px solid var(--border)',
          padding: '16px 14px',
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          {/* Load deck */}
          {!deckId && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 8 }}>
                Load deck
              </div>
              <input
                value={deckInput}
                onChange={e => setDeckInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadDeck()}
                placeholder="Deck ID or slug"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: 7, padding: '7px 10px',
                  color: 'var(--text)', fontSize: 12,
                  fontFamily: mono, outline: 'none', marginBottom: 8,
                }}
              />
              <button
                onClick={loadDeck}
                disabled={!deckInput.trim()}
                style={{
                  width: '100%', padding: '7px', borderRadius: 7,
                  background: deckInput.trim() ? 'var(--accent)' : 'var(--surface)',
                  border: `1px solid ${deckInput.trim() ? 'var(--accent)' : 'var(--border)'}`,
                  color: deckInput.trim() ? '#0a1f22' : 'var(--text-faint)',
                  fontWeight: 700, fontSize: 12, cursor: deckInput.trim() ? 'pointer' : 'not-allowed',
                  fontFamily: sans,
                }}
              >
                Load
              </button>
            </div>
          )}

          {cards.length > 0 && (
            <>
              {/* Select all / none */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => toggleAll(true)}
                  style={{
                    flex: 1, padding: '6px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', fontFamily: mono,
                    background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-faint)',
                  }}
                >
                  All
                </button>
                <button
                  onClick={() => toggleAll(false)}
                  style={{
                    flex: 1, padding: '6px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', fontFamily: mono,
                    background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-faint)',
                  }}
                >
                  None
                </button>
              </div>

              {/* Card list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cards.map(c => {
                  const isSelected = selected.has(c.oracle_id);
                  const qty = quantities[c.oracle_id] ?? c.quantity;
                  return (
                    <div
                      key={c.oracle_id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 10px', borderRadius: 7,
                        background: isSelected ? 'rgba(232,177,74,0.07)' : 'var(--surface)',
                        border: `1px solid ${isSelected ? 'rgba(232,177,74,0.3)' : 'var(--border)'}`,
                        cursor: 'pointer',
                      }}
                      onClick={() => toggleCard(c.oracle_id)}
                    >
                      <div style={{
                        width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                        border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                        background: isSelected ? 'var(--accent)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isSelected && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#0a1f22" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <span style={{ flex: 1, fontSize: 11.5, fontWeight: isSelected ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.card_name}
                      </span>
                      {/* Qty stepper */}
                      <div
                        onClick={e => e.stopPropagation()}
                        style={{ display: 'flex', alignItems: 'center', gap: 3 }}
                      >
                        <button
                          onClick={() => setQty(c.oracle_id, qty - 1)}
                          style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >−</button>
                        <span style={{ fontFamily: mono, fontSize: 11, minWidth: 12, textAlign: 'center', color: 'var(--accent)' }}>{qty}</span>
                        <button
                          onClick={() => setQty(c.oracle_id, qty + 1)}
                          style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Proxy grid */}
        <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          {totalCards === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--text-faint)' }}>
              <div style={{ fontSize: 36, marginBottom: 16 }}>🖨</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>No cards selected</div>
              <div style={{ fontSize: 12 }}>
                {cards.length === 0 ? 'Load a deck using the sidebar.' : 'Check cards in the sidebar to include them.'}
              </div>
            </div>
          ) : (
            <div className="proxy-grid" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 63mm)',
              gap: '3mm',
            }}>
              {printCards.map(c => (
                <div
                  key={c.oracle_id}
                  className="proxy-card"
                  style={{
                    width: '63mm', height: '88mm',
                    borderRadius: '3mm',
                    overflow: 'hidden',
                    border: '1px solid var(--border)',
                    background: '#000',
                    flexShrink: 0,
                  }}
                >
                  {c.image_url ? (
                    <img
                      src={c.image_url}
                      alt={c.card_name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{
                      width: '100%', height: '100%',
                      background: '#0a1019',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      padding: '8px', textAlign: 'center',
                      color: '#6f8a85',
                    }}>
                      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: '#3f5d59', marginBottom: 8 }}>
                        Proxy
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#9bb3ad', lineHeight: 1.4 }}>
                        {c.card_name}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
