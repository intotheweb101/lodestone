'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { initDraft, pickCard } from '@/lib/draft/simulator';
import type { SealedCard, DraftState } from '@/lib/draft/simulator';
import { actionCreateDeck, actionAddCard } from '@/app/actions';

const RARITY_COLOR: Record<string, string> = {
  common: '#a0a0a0',
  uncommon: '#b0c8e0',
  rare: '#e8b14a',
  mythic: '#e0804a',
};

const COLOR_FILTERS = ['All', 'W', 'U', 'B', 'R', 'G', 'C'] as const;
const COLOR_NAMES: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless' };

interface Props {
  setCode: string;
  initialPacks: SealedCard[][];
}

export function DraftClient({ setCode, initialPacks }: Props) {
  const [state, setState] = useState<DraftState>(() => initDraft(initialPacks));
  const [deckCards, setDeckCards] = useState<Set<string>>(new Set());
  const [colorFilter, setColorFilter] = useState<string>('All');
  const [deckName, setDeckName] = useState(`${setCode} Draft`);
  const [savedDeckId, setSavedDeckId] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [hovered, setHovered] = useState<string | null>(null);
  const router = useRouter();

  const totalPicks = 3 * (initialPacks[0]?.length ?? 15);
  const progress = Math.round((state.picks.length / totalPicks) * 100);

  function pick(card: SealedCard) {
    setState(s => pickCard(s, card));
  }

  function toggleDeckCard(card: SealedCard) {
    setDeckCards(prev => {
      const next = new Set(prev);
      if (next.has(card.scryfall_id)) next.delete(card.scryfall_id);
      else next.add(card.scryfall_id);
      return next;
    });
  }

  function saveDeck() {
    startSave(async () => {
      const deck = await actionCreateDeck(deckName, 'standard');
      const selected = state.picks.filter(c => deckCards.has(c.scryfall_id));
      for (const card of selected) {
        await actionAddCard(deck.id, {
          oracle_id: card.oracle_id,
          scryfall_id: card.scryfall_id,
          card_name: card.name,
          quantity: 1,
          board: 'main',
        });
      }
      setSavedDeckId(deck.id);
    });
  }

  const mono = { fontFamily: "'IBM Plex Mono', monospace" } as const;

  // ── Drafting phase ─────────────────────────────────────────────────────────
  if (!state.done) {
    const currentPack = state.currentPack;

    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem', color: 'var(--text)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ ...mono, fontSize: '12px', color: 'var(--accent)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              {setCode} Draft
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700 }}>
              Pack {state.packNum} · Pick {state.pickNum}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', ...mono, fontSize: '11px', color: 'var(--text-faint)' }}>
            {state.picks.length} picked
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: '4px', borderRadius: '3px', background: 'var(--border)', marginBottom: '20px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', borderRadius: '3px', transition: 'width 0.3s ease' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '20px', alignItems: 'start' }}>
          {/* Pack */}
          <div>
            <div style={{ ...mono, fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: '10px' }}>
              {currentPack.length} cards remaining — click to pick
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '10px' }}>
              {currentPack.map(card => (
                <div
                  key={card.scryfall_id}
                  onClick={() => pick(card)}
                  onMouseEnter={() => setHovered(card.scryfall_id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    cursor: 'pointer',
                    transform: hovered === card.scryfall_id ? 'scale(1.05) translateY(-2px)' : 'none',
                    transition: 'transform 0.12s ease',
                    position: 'relative',
                  }}
                >
                  <div style={{ borderRadius: '6px', overflow: 'hidden', border: `1px solid ${hovered === card.scryfall_id ? 'var(--accent)' : 'var(--border)'}`, transition: 'border-color 0.12s' }}>
                    {card.image_url ? (
                      <img src={card.image_url} alt={card.name} style={{ width: '100%', aspectRatio: '0.717', objectFit: 'cover', display: 'block' }} loading="lazy" />
                    ) : (
                      <div style={{ width: '100%', aspectRatio: '0.717', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: 'var(--text-faint)', padding: '4px', textAlign: 'center' }}>
                        {card.name}
                      </div>
                    )}
                  </div>
                  {/* Rarity dot */}
                  <div style={{ position: 'absolute', top: '4px', right: '4px', width: '7px', height: '7px', borderRadius: '50%', background: RARITY_COLOR[card.rarity] ?? '#888', border: '1px solid rgba(0,0,0,0.3)' }} />
                  <div style={{ fontSize: '9px', color: 'var(--text-faint)', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                    {card.name}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Picks so far */}
          <div style={{ position: 'sticky', top: '16px' }}>
            <div style={{ ...mono, fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: '8px' }}>
              Picks ({state.picks.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {state.picks.map((card, i) => (
                <div key={`${card.scryfall_id}-${i}`} title={card.name}>
                  {card.image_url ? (
                    <img src={card.image_url} alt={card.name} style={{ width: '38px', borderRadius: '3px', display: 'block', border: '1px solid var(--border)' }} loading="lazy" />
                  ) : (
                    <div style={{ width: '38px', height: '53px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px' }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Pool builder phase ─────────────────────────────────────────────────────
  const filteredPicks = colorFilter === 'All'
    ? state.picks
    : state.picks.filter(c => {
        if (colorFilter === 'C') return c.colors.length === 0;
        return c.colors.includes(colorFilter);
      });

  const deckList = state.picks.filter(c => deckCards.has(c.scryfall_id));
  const deckByType: Record<string, SealedCard[]> = {};
  for (const c of deckList) {
    const group = (c.type_line ?? 'Other').split('—')[0].trim().split(' ').pop() ?? 'Other';
    if (!deckByType[group]) deckByType[group] = [];
    deckByType[group].push(c);
  }

  return (
    <div style={{ maxWidth: '1300px', margin: '0 auto', padding: '1.5rem', color: 'var(--text)' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ ...mono, fontSize: '11px', color: 'var(--accent)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>
          {setCode} Draft Complete
        </div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px' }}>
          You picked {state.picks.length} cards
        </h1>
        <p style={{ color: 'var(--text-faint)', fontSize: '12px' }}>
          Click cards to add/remove from your deck. Save when ready.
        </p>
      </div>

      {/* Color filter */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {COLOR_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setColorFilter(f)}
            style={{
              padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
              cursor: 'pointer', ...mono,
              background: colorFilter === f ? 'rgba(232,177,74,0.15)' : 'var(--surface)',
              border: `1px solid ${colorFilter === f ? 'var(--accent)' : 'var(--border)'}`,
              color: colorFilter === f ? 'var(--accent)' : 'var(--text-faint)',
              transition: 'all 0.1s',
            }}
          >
            {f === 'All' ? 'All' : COLOR_NAMES[f] ?? f}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: '20px', alignItems: 'start' }}>
        {/* Pool */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px' }}>
          {filteredPicks.map((card, i) => {
            const inDeck = deckCards.has(card.scryfall_id);
            return (
              <div
                key={`${card.scryfall_id}-${i}`}
                onClick={() => toggleDeckCard(card)}
                title={card.name}
                style={{ cursor: 'pointer', position: 'relative', opacity: inDeck ? 1 : 0.55, transition: 'opacity 0.1s' }}
              >
                <div style={{ borderRadius: '5px', overflow: 'hidden', border: `1px solid ${inDeck ? 'rgba(84,192,138,0.6)' : 'var(--border)'}`, transition: 'border-color 0.1s' }}>
                  {card.image_url ? (
                    <img src={card.image_url} alt={card.name} style={{ width: '100%', aspectRatio: '0.717', objectFit: 'cover', display: 'block' }} loading="lazy" />
                  ) : (
                    <div style={{ width: '100%', aspectRatio: '0.717', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: 'var(--text-faint)', padding: '3px', textAlign: 'center' }}>
                      {card.name}
                    </div>
                  )}
                </div>
                {inDeck && (
                  <div style={{ position: 'absolute', top: '3px', right: '3px', background: 'rgba(84,192,138,0.9)', color: '#0a1f22', ...mono, fontSize: '8px', fontWeight: 700, padding: '1px 3px', borderRadius: '2px' }}>✓</div>
                )}
                <div style={{ ...mono, position: 'absolute', top: '3px', left: '3px', width: '6px', height: '6px', borderRadius: '50%', background: RARITY_COLOR[card.rarity] ?? '#888', border: '1px solid rgba(0,0,0,0.3)' }} />
              </div>
            );
          })}
        </div>

        {/* Deck list + save */}
        <div style={{ position: 'sticky', top: '16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px', maxHeight: '80vh', overflowY: 'auto' }}>
          <div style={{ ...mono, fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: '10px' }}>
            Deck ({deckCards.size} cards)
          </div>

          {Object.entries(deckByType).sort().map(([type, cards]) => (
            <div key={type} style={{ marginBottom: '10px' }}>
              <div style={{ ...mono, fontSize: '9.5px', color: 'var(--text-faint)', marginBottom: '4px' }}>{type} ({cards.length})</div>
              {cards.sort((a, b) => (a.cmc ?? 0) - (b.cmc ?? 0)).map((c, i) => (
                <div key={`${c.scryfall_id}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0', fontSize: '11px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ ...mono, color: 'var(--accent)', fontSize: '10px', minWidth: '14px' }}>{c.cmc ?? '—'}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.name}</span>
                </div>
              ))}
            </div>
          ))}

          {deckCards.size === 0 && (
            <p style={{ fontSize: '11px', color: 'var(--text-faint)', textAlign: 'center', padding: '12px 0' }}>Click cards to add them</p>
          )}

          {savedDeckId ? (
            <a href={`/decks/${savedDeckId}`} style={{ display: 'block', width: '100%', padding: '8px', borderRadius: '8px', background: '#54c08a', color: '#0a1f22', textAlign: 'center', fontWeight: 700, fontSize: '12px', textDecoration: 'none', marginTop: '12px', fontFamily: "'IBM Plex Sans', sans-serif" }}>
              Open deck →
            </a>
          ) : (
            <>
              <input
                value={deckName}
                onChange={e => setDeckName(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 8px', fontSize: '11px', color: 'var(--text)', fontFamily: "'IBM Plex Sans', sans-serif", outline: 'none', marginTop: '12px' }}
              />
              <button
                onClick={saveDeck}
                disabled={saving || deckCards.size === 0}
                style={{ width: '100%', marginTop: '8px', padding: '8px', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: deckCards.size > 0 && !saving ? 'pointer' : 'not-allowed', background: deckCards.size > 0 && !saving ? 'var(--accent)' : 'var(--surface)', border: '1px solid var(--border)', color: deckCards.size > 0 && !saving ? '#0a1f22' : 'var(--text-faint)', fontFamily: "'IBM Plex Sans', sans-serif", transition: 'all 0.12s' }}
              >
                {saving ? 'Saving…' : 'Save deck'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
