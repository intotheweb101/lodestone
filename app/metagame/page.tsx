/**
 * /metagame — Site-native metagame data generated from public decks.
 * Shows deck of the day, format leaderboard, most-played staples, and trending decks.
 */
import { getTopStaples, getTrendingDecks, getTrendingDecksSince, getDeckOfTheDay, getDecksUsingCard } from '@/lib/deck/store';
import { runMigrations } from '@/lib/db/migrations';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Metagame — Lodestone',
  description: 'Most-played cards and trending decks across all public Lodestone lists.',
};

const FORMATS = ['commander', 'standard', 'modern', 'pioneer', 'legacy', 'pauper'];

function DeckCard({ deck, rank }: { deck: { id: string; name: string; format: string; commander: string | null; card_count: number; like_count: number; public_slug: string | null }; rank?: number }) {
  return (
    <Link
      href={deck.public_slug ? `/d/${deck.public_slug}` : `/decks/${deck.id}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
        textDecoration: 'none', color: 'var(--text)',
      }}
    >
      {rank !== undefined && (
        <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono',monospace", minWidth: 20, textAlign: 'right' }}>{rank}</span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deck.name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
          {deck.format}{deck.commander ? ` · ${deck.commander}` : ''} · {deck.card_count} cards
        </div>
      </div>
      {deck.like_count > 0 && (
        <span style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>♥ {deck.like_count}</span>
      )}
    </Link>
  );
}

export default async function MetagamePage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string; card?: string }>;
}) {
  runMigrations();
  const { format, card: cardOracleId } = await searchParams;
  const activeFormat = FORMATS.includes(format ?? '') ? format! : null;

  const staples = getTopStaples(activeFormat, 50);
  const trending = getTrendingDecks(20, activeFormat);
  const leaderboard = getTrendingDecksSince(activeFormat, 30, 10);
  const deckOfDay = getDeckOfTheDay();
  const cardDecks = cardOracleId ? getDecksUsingCard(cardOracleId, 20) : null;
  const cardName = cardOracleId ? staples.find(s => s.oracle_id === cardOracleId)?.card_name ?? null : null;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px', color: 'var(--text)' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 700 }}>Metagame</h1>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-faint)' }}>
        Derived from public Lodestone decks. Updated in real time.
      </p>

      {/* Deck of the Day */}
      {deckOfDay && (
        <section style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 10 }}>
            ✦ Deck of the Day
          </div>
          <Link
            href={deckOfDay.public_slug ? `/d/${deckOfDay.public_slug}` : `/decks/${deckOfDay.id}`}
            style={{
              display: 'block', padding: '20px 24px',
              background: 'linear-gradient(135deg, rgba(232,177,74,0.08) 0%, var(--surface) 100%)',
              border: '1px solid rgba(232,177,74,0.3)',
              borderRadius: 12, textDecoration: 'none', color: 'var(--text)',
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>{deckOfDay.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>
              <span style={{ textTransform: 'capitalize', background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4, marginRight: 8 }}>{deckOfDay.format}</span>
              {deckOfDay.commander && <span style={{ marginRight: 8 }}>{deckOfDay.commander}</span>}
              <span style={{ marginRight: 8 }}>{deckOfDay.card_count} cards</span>
              {deckOfDay.like_count > 0 && <span>♥ {deckOfDay.like_count} likes</span>}
            </div>
          </Link>
        </section>
      )}

      {/* Format tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 28, flexWrap: 'wrap' }}>
        {[{ label: 'All formats', value: '' }, ...FORMATS.map(f => ({ label: f.charAt(0).toUpperCase() + f.slice(1), value: f }))].map(f => (
          <Link
            key={f.value}
            href={f.value ? `/metagame?format=${f.value}` : '/metagame'}
            style={{
              fontSize: 12, padding: '5px 12px', borderRadius: 20,
              background: (activeFormat ?? '') === f.value ? 'var(--accent)' : 'var(--surface)',
              color: (activeFormat ?? '') === f.value ? '#0a1f22' : 'var(--text-muted)',
              border: '1px solid var(--border)',
              textDecoration: 'none', fontWeight: 500,
            }}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'start' }}>

        {/* Left column: staples + leaderboard */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

          {/* Format leaderboard (last 30 days) */}
          {leaderboard.length > 0 && (
            <section>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Top decks · last 30 days {activeFormat ? `· ${activeFormat}` : ''}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {leaderboard.map((d, i) => (
                  <DeckCard key={d.id} deck={d} rank={i + 1} />
                ))}
              </div>
            </section>
          )}

          {/* Most-played staples */}
          <section>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Most-played cards {activeFormat ? `· ${activeFormat}` : ''}
            </h2>
            {staples.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>No public decks yet{activeFormat ? ` in ${activeFormat}` : ''}.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {staples.map((s, i) => (
                  <div
                    key={s.oracle_id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                      background: 'var(--surface)', borderRadius: 6, fontSize: 13,
                      border: cardOracleId === s.oracle_id ? '1px solid var(--accent)' : '1px solid var(--border)',
                    }}
                  >
                    <span style={{ minWidth: 24, color: 'var(--text-faint)', fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", textAlign: 'right' }}>
                      {i + 1}
                    </span>
                    <span style={{ flex: 1 }}>{s.card_name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                      {s.deck_count} deck{s.deck_count !== 1 ? 's' : ''}
                    </span>
                    {cardOracleId === s.oracle_id ? (
                      <Link
                        href={`/metagame?format=${activeFormat ?? ''}`}
                        style={{ fontSize: 11, color: 'var(--text-faint)', textDecoration: 'none', whiteSpace: 'nowrap' }}
                      >
                        close ✕
                      </Link>
                    ) : (
                      <Link
                        href={`/metagame?format=${activeFormat ?? ''}&card=${s.oracle_id}`}
                        style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}
                      >
                        see decks →
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Decks using the selected card */}
          {cardDecks && (
            <section>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Decks playing {cardName ?? 'this card'}
              </h2>
              {cardDecks.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>No public decks found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {cardDecks.map((d, i) => (
                    <DeckCard key={d.id} deck={d} rank={i + 1} />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Right column: all-time trending */}
        <section>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            All-time trending {activeFormat ? `· ${activeFormat}` : ''}
          </h2>
          {trending.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>No public decks yet{activeFormat ? ` in ${activeFormat}` : ''}.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {trending.map((d, i) => (
                <DeckCard key={d.id} deck={d} rank={i + 1} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
