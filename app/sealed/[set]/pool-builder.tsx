'use client';
import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { PackPool, SealedCard } from '@/lib/sealed/packs';
import { actionCreateDeck, actionAddCard } from '@/app/actions';

// ─── Types ────────────────────────────────────────────────────────────────────

type ColorFilter = 'all' | 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

const COLOR_LABELS: Record<ColorFilter, string> = {
  all: 'All', W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless',
};
const COLOR_HEX: Record<string, string> = {
  W: '#f7efd2', U: '#a9def9', B: '#bcb4ad', R: '#f3a48b', G: '#93c8a6', C: '#c9c3bc',
};
const RARITY_COLOR: Record<string, string> = {
  common: 'rgba(255,255,255,0.3)', uncommon: '#a9c0ba', rare: '#e8b14a', mythic: '#e87a6b',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cardColor(card: SealedCard): string {
  if (card.colors.length === 0) return 'C';
  if (card.colors.length > 1) return 'M';
  return card.colors[0];
}

function matchesFilter(card: SealedCard, filter: ColorFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'C') return card.colors.length === 0;
  return card.colors.includes(filter);
}

function groupByType(cards: SealedCard[]): Record<string, SealedCard[]> {
  const ORDER = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land', 'Other'];
  const g: Record<string, SealedCard[]> = {};
  for (const c of cards) {
    const tl = c.type_line ?? '';
    const key = ORDER.find(t => tl.includes(t)) ?? 'Other';
    if (!g[key]) g[key] = [];
    g[key].push(c);
  }
  return g;
}
const TYPE_ORDER = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land', 'Other'];

// ─── Card thumbnail ───────────────────────────────────────────────────────────

function CardThumb({
  card, inDeck, onClick,
}: { card: SealedCard; inDeck: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const col = cardColor(card);
  const borderCol = COLOR_HEX[col] ?? 'var(--border)';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        width: 80, height: 112,
        borderRadius: 6,
        overflow: 'hidden',
        cursor: 'pointer',
        border: `2px solid ${inDeck ? borderCol : hover ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
        opacity: inDeck ? 1 : 0.55,
        transition: 'all 0.12s',
        flexShrink: 0,
        background: 'var(--surface)',
      }}
    >
      {card.image_url ? (
        <img src={card.image_url} alt={card.name} loading="lazy"
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
          <span style={{ fontSize: 9, textAlign: 'center', color: 'var(--text-faint)', lineHeight: 1.3 }}>{card.name}</span>
        </div>
      )}
      {/* Rarity dot */}
      <div style={{
        position: 'absolute', bottom: 3, right: 3,
        width: 7, height: 7, borderRadius: '50%',
        background: RARITY_COLOR[card.rarity] ?? 'var(--text-faint)',
        border: '1px solid rgba(0,0,0,0.4)',
      }} />
      {/* In-deck badge */}
      {inDeck && (
        <div style={{
          position: 'absolute', top: 2, left: 2,
          background: 'rgba(72,200,160,0.85)',
          borderRadius: 3, padding: '1px 4px', fontSize: 8,
          fontWeight: 700, color: '#001a14', fontFamily: "'IBM Plex Mono', monospace",
        }}>
          ✓
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { pool: PackPool; userId: string | null }

export function PoolBuilder({ pool, userId }: Props) {
  const [deckIds, setDeckIds] = useState<Set<string>>(new Set());
  const [colorFilter, setColorFilter] = useState<ColorFilter>('all');
  const [hoveredCard, setHoveredCard] = useState<SealedCard | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedDeckId, setSavedDeckId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const deckCards = useMemo(() => pool.cards.filter(c => deckIds.has(c.scryfall_id)), [pool.cards, deckIds]);
  const deckSize = deckCards.length;

  function toggleCard(card: SealedCard) {
    setDeckIds(prev => {
      const next = new Set(prev);
      if (next.has(card.scryfall_id)) next.delete(card.scryfall_id);
      else next.add(card.scryfall_id);
      return next;
    });
  }

  const filteredPool = useMemo(() =>
    pool.cards.filter(c => matchesFilter(c, colorFilter)),
    [pool.cards, colorFilter]
  );

  const deckGroups = useMemo(() => groupByType(deckCards), [deckCards]);

  function showTooltip(card: SealedCard, e: React.MouseEvent) {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredCard(card);
    setHoverPos({ x: rect.right + 8, y: rect.top });
  }

  async function saveDeck() {
    if (!userId || deckSize === 0 || saving) return;
    setSaving(true);
    try {
      const result = await actionCreateDeck(`${pool.setName} Sealed`, 'standard') as { id: string };
      const deckId = result.id;
      for (const card of deckCards) {
        await actionAddCard(deckId, {
          oracle_id: card.oracle_id,
          scryfall_id: card.scryfall_id,
          card_name: card.name,
          board: 'main',
          quantity: 1,
        });
      }
      setSavedDeckId(deckId);
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  }

  const toSideCount = pool.cards.length - deckSize;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'IBM Plex Sans', sans-serif" }}>

      {/* ── Top bar ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        <a href="/sealed" style={{ fontSize: 12, color: 'var(--text-faint)', textDecoration: 'none' }}>← Sets</a>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{pool.setName}</div>
          <div style={{ fontSize: 10, color: 'var(--text-faintest)', fontFamily: "'IBM Plex Mono', monospace" }}>
            {pool.packCount} packs · {pool.cards.length} cards
            {' · '}
            <span style={{ color: '#48c8a0' }}>{pool.totalRares}R</span>
            {pool.totalMythics > 0 && <span style={{ color: '#e87a6b' }}> {pool.totalMythics}M</span>}
            {' '}
            <span style={{ color: '#a9c0ba' }}>{pool.totalUncommons}U</span>
            {' '}
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>{pool.totalCommons}C</span>
          </div>
        </div>

        {/* Color filter */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
          {(['all', 'W', 'U', 'B', 'R', 'G', 'C'] as ColorFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setColorFilter(f)}
              title={COLOR_LABELS[f]}
              style={{
                width: f === 'all' ? 38 : 28, height: 28, borderRadius: 6, fontSize: f === 'all' ? 10 : 12,
                fontWeight: 700, cursor: 'pointer',
                background: colorFilter === f
                  ? f === 'all' ? 'rgba(232,177,74,0.15)' : `${COLOR_HEX[f] ?? '#888'}22`
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${colorFilter === f
                  ? f === 'all' ? 'var(--accent)' : (COLOR_HEX[f] ?? 'var(--border)')
                  : 'rgba(255,255,255,0.1)'}`,
                color: colorFilter === f
                  ? f === 'all' ? 'var(--accent)' : (COLOR_HEX[f] ?? 'var(--text)')
                  : 'rgba(255,255,255,0.4)',
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>

        {/* Deck stats */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace", color: deckSize >= 40 ? '#48c8a0' : 'var(--text)' }}>
              {deckSize}<span style={{ fontSize: 12, color: 'var(--text-faintest)', fontWeight: 400 }}>/40</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-faintest)', fontFamily: "'IBM Plex Mono', monospace" }}>
              {toSideCount} sideboard
            </div>
          </div>

          {savedDeckId ? (
            <button
              onClick={() => startTransition(() => router.push(`/decks/${savedDeckId}`))}
              style={{
                padding: '8px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: 'rgba(72,200,160,0.15)', border: '1px solid rgba(72,200,160,0.4)', color: '#48c8a0',
              }}
            >
              Open deck →
            </button>
          ) : (
            <button
              onClick={saveDeck}
              disabled={!userId || deckSize === 0 || saving}
              style={{
                padding: '8px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                cursor: userId && deckSize > 0 ? 'pointer' : 'not-allowed',
                background: userId && deckSize > 0 ? 'var(--accent)' : 'var(--surface-2)',
                border: `1px solid ${userId && deckSize > 0 ? 'var(--accent)' : 'var(--border)'}`,
                color: userId && deckSize > 0 ? '#0a1f22' : 'var(--text-faintest)',
                transition: 'all 0.15s',
              }}
            >
              {saving ? 'Saving…' : !userId ? 'Log in to save' : deckSize === 0 ? 'Pick cards' : 'Save deck'}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 64px)' }}>

        {/* ── Pool panel ── */}
        <div style={{ flex: 1, minWidth: 0, padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-faintest)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1, marginBottom: 14, textTransform: 'uppercase' }}>
            Pool ({filteredPool.length} cards) — click to add/remove from deck
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {filteredPool.map(card => (
              <div
                key={card.scryfall_id}
                onMouseEnter={e => showTooltip(card, e)}
                onMouseLeave={() => { setHoveredCard(null); setHoverPos(null); }}
              >
                <CardThumb
                  card={card}
                  inDeck={deckIds.has(card.scryfall_id)}
                  onClick={() => toggleCard(card)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Deck list panel ── */}
        <div style={{
          width: 220, flexShrink: 0, borderLeft: '1px solid var(--border)',
          background: 'var(--surface)', padding: '16px 14px', overflowY: 'auto',
          maxHeight: 'calc(100vh - 64px)', position: 'sticky', top: 64,
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-faintest)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' }}>
            Deck ({deckSize})
          </div>
          {deckSize === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-faintest)', lineHeight: 1.6 }}>
              Click cards in the pool to add them to your deck.
            </div>
          ) : (
            TYPE_ORDER.filter(t => deckGroups[t]?.length).map(type => (
              <div key={type} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--text-faintest)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                  {type} ({deckGroups[type].reduce((s) => s + 1, 0)})
                </div>
                {deckGroups[type]
                  .sort((a, b) => (a.cmc ?? 0) - (b.cmc ?? 0) || a.name.localeCompare(b.name))
                  .map(card => (
                    <div
                      key={card.scryfall_id}
                      onClick={() => toggleCard(card)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px',
                        cursor: 'pointer', borderRadius: 4,
                        transition: 'background 0.08s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)'; showTooltip(card, e); }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; setHoveredCard(null); setHoverPos(null); }}
                    >
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        background: card.colors.length > 0 ? (COLOR_HEX[card.colors[0]] ?? 'var(--text-faint)') : 'var(--border)',
                      }} />
                      <span style={{ fontSize: 11.5, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-muted)' }}>
                        {card.name}
                      </span>
                      <span style={{ fontSize: 10, color: RARITY_COLOR[card.rarity] ?? 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0 }}>
                        {card.cmc != null ? card.cmc : ''}
                      </span>
                    </div>
                  ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Hover tooltip ── */}
      {hoveredCard && hoverPos && hoveredCard.image_url && (
        <div style={{
          position: 'fixed',
          left: Math.min(hoverPos.x, window.innerWidth - 220),
          top: Math.min(hoverPos.y, window.innerHeight - 320),
          zIndex: 100,
          pointerEvents: 'none',
          borderRadius: 10,
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          width: 200,
        }}>
          <img src={hoveredCard.image_url} alt={hoveredCard.name}
            style={{ display: 'block', width: '100%', height: 'auto' }} />
        </div>
      )}
    </div>
  );
}
