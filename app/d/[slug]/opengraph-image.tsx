/**
 * Generated OG image for public/unlisted deck pages.
 * Uses next/og ImageResponse — Lodestone-branded 1200×630.
 */
import { ImageResponse } from 'next/og';
import { getDeckBySlug } from '@/lib/deck/store';
import { getWinRate } from '@/lib/games/store';
import { mainboardEntries } from '@/lib/deck/model';

export const alt = 'Deck on Lodestone';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Lodestone mana pip palette */
const MANA_COLORS: Record<string, string> = {
  W: '#f7efd2',
  U: '#a9def9',
  B: '#bcb4ad',
  R: '#f3a48b',
  G: '#93c8a6',
  C: '#c9c3bc',
};

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const deck = getDeckBySlug(slug);

  // Fallback for missing / private decks
  if (!deck || deck.visibility === 'private') {
    return new ImageResponse(
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#07151a',
        }}
      >
        <span style={{ color: '#e8b14a', fontSize: 52, fontWeight: 700 }}>Lodestone</span>
      </div>,
      { ...size }
    );
  }

  const winRate = getWinRate(deck.id);
  const mainboard = mainboardEntries(deck);
  const totalCards = mainboard.reduce((s, e) => s + e.quantity, 0);
  const commander = deck.entries?.find(e => e.is_commander);
  const colorIdentity: string[] = Array.isArray(deck.color_identity) ? deck.color_identity : [];
  const format = deck.format
    ? deck.format.charAt(0).toUpperCase() + deck.format.slice(1)
    : 'Unknown';

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '56px 72px',
        background: 'linear-gradient(155deg, #102d2f 0%, #07151a 58%)',
        fontFamily: '-apple-system, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      {/* ── Brand bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span
          style={{
            color: '#e8b14a',
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: 3,
          }}
        >
          LODESTONE
        </span>
        <span style={{ color: '#3a5a56', fontSize: 13, letterSpacing: 1 }}>
          NZD · MTG
        </span>
      </div>

      {/* ── Main content ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Format badge + color pips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              background: 'rgba(232,177,74,0.12)',
              border: '1px solid rgba(232,177,74,0.35)',
              borderRadius: 6,
              padding: '5px 16px',
              color: '#e8b14a',
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: 2,
            }}
          >
            {format.toUpperCase()}
          </span>
          {colorIdentity.map((c, i) => (
            <div
              key={c + String(i)}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: MANA_COLORS[c] ?? '#888888',
                border: '2px solid rgba(255,255,255,0.15)',
              }}
            />
          ))}
        </div>

        {/* Deck name */}
        <div
          style={{
            color: '#eef3f0',
            fontSize: deck.name.length > 28 ? 54 : 68,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -1.5,
            maxWidth: 960,
          }}
        >
          {deck.name}
        </div>

        {/* Commander */}
        {commander && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                color: '#6f8a85',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: 1,
              }}
            >
              COMMANDER
            </span>
            <span style={{ color: '#e8b14a', fontSize: 18 }}>·</span>
            <span style={{ color: '#a9c0ba', fontSize: 20 }}>
              {commander.card_name}
            </span>
          </div>
        )}
      </div>

      {/* ── Stats footer ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          paddingTop: 20,
          borderTop: '1px solid rgba(29,68,65,0.5)',
        }}
      >
        <span style={{ color: '#6f8a85', fontSize: 16 }}>
          <span style={{ color: '#eef3f0', fontWeight: 600 }}>{totalCards}</span>
          {' cards'}
        </span>

        {winRate.games > 0 && (
          <>
            <span style={{ color: '#2a4a47', fontSize: 22 }}>·</span>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(72,200,160,0.1)',
                border: '1px solid rgba(72,200,160,0.3)',
                borderRadius: 6,
                padding: '4px 14px',
                color: '#48c8a0',
                fontSize: 15,
              }}
            >
              {winRate.winPct}% win rate · {winRate.games} game{winRate.games !== 1 ? 's' : ''}
            </span>
          </>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        <span style={{ color: '#3a5a56', fontSize: 14 }}>lodestone.nz</span>
      </div>
    </div>,
    { ...size }
  );
}
