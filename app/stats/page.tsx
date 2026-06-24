import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { runMigrations } from '@/lib/db/migrations';
import { resolveActingUser } from '@/lib/auth/session';
import { getPlayerStats } from '@/lib/stats/player';
import type { ColorStat, FormatStat, CardStat, CommanderStat } from '@/lib/stats/player';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your Stats — Lodestone' };

let migrated = false;

// ─── Color helpers ────────────────────────────────────────────────────────────

const COLOR_META: Record<string, { label: string; fill: string; bg: string }> = {
  W: { label: 'White', fill: '#f5f0d8', bg: 'rgba(245,240,216,0.12)' },
  U: { label: 'Blue',  fill: '#4a90d9', bg: 'rgba(74,144,217,0.12)' },
  B: { label: 'Black', fill: '#9b8fba', bg: 'rgba(155,143,186,0.12)' },
  R: { label: 'Red',   fill: '#e05b3c', bg: 'rgba(224,91,60,0.12)' },
  G: { label: 'Green', fill: '#4caf7a', bg: 'rgba(76,175,122,0.12)' },
  C: { label: 'Colorless', fill: '#a0b0b4', bg: 'rgba(160,176,180,0.12)' },
};

const PIP: Record<string, string> = { W: '☀', U: '💧', B: '💀', R: '🔥', G: '🌲', C: '◇' };

// ─── Shared styles ────────────────────────────────────────────────────────────

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '20px 22px',
};

const sectionLabel: CSSProperties = {
  fontSize: '10px',
  fontFamily: "'IBM Plex Mono', monospace",
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  color: 'var(--text-faint)',
  marginBottom: '14px',
};

const mono: CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatChip({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{
      ...card,
      padding: '14px 18px',
      minWidth: '110px',
      flex: '1 1 110px',
    }}>
      <div style={{ fontSize: '10px', ...mono, color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ ...mono, fontSize: '22px', fontWeight: 700, color: accent ? 'var(--accent)' : '#54c08a', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ ...mono, fontSize: '9.5px', color: 'var(--text-faint)', marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

function ColorBars({ colors }: { colors: ColorStat[] }) {
  if (colors.length === 0) return <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>No decks yet.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {colors.map(c => {
        const meta = COLOR_META[c.color] ?? { label: c.color, fill: '#a0a0a0', bg: 'rgba(160,160,160,0.12)' };
        return (
          <div key={c.color}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: meta.fill }}>
                {PIP[c.color] ?? ''} {meta.label}
              </span>
              <span style={{ ...mono, fontSize: '11px', color: 'var(--text-faint)' }}>
                {c.deckCount} deck{c.deckCount !== 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ height: '6px', borderRadius: '4px', background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${c.pct}%`, borderRadius: '4px', background: meta.fill, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FormatTable({ formats }: { formats: FormatStat[] }) {
  if (formats.length === 0) return <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>No decks yet.</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Format', 'Decks', 'Games', 'Win %'].map(h => (
              <th key={h} style={{ ...mono, fontSize: '9.5px', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-faint)', padding: '6px 10px', textAlign: h === 'Format' ? 'left' : 'right', fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {formats.map(f => (
            <tr key={f.format} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '8px 10px', fontWeight: 600, textTransform: 'capitalize', color: 'var(--text)' }}>{f.format}</td>
              <td style={{ ...mono, padding: '8px 10px', textAlign: 'right', color: 'var(--accent)' }}>{f.deckCount}</td>
              <td style={{ ...mono, padding: '8px 10px', textAlign: 'right', color: 'var(--text-faint)' }}>{f.games}</td>
              <td style={{ ...mono, padding: '8px 10px', textAlign: 'right', color: f.winPct !== null ? (f.winPct >= 50 ? '#54c08a' : '#e2645c') : 'var(--text-faint)' }}>
                {f.winPct !== null ? `${f.winPct}%` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardGrid({ cards }: { cards: CardStat[] }) {
  if (cards.length === 0) return <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>No cards in decks yet.</p>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '10px' }}>
      {cards.map(c => (
        <div key={c.oracle_id} title={c.card_name} style={{ position: 'relative', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
          {c.image_url ? (
            <img src={c.image_url} alt={c.card_name} style={{ width: '100%', aspectRatio: '0.717', objectFit: 'cover', display: 'block' }} loading="lazy" />
          ) : (
            <div style={{ width: '100%', aspectRatio: '0.717', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'var(--text-faint)', padding: '4px', textAlign: 'center' }}>
              {c.card_name}
            </div>
          )}
          <div style={{ position: 'absolute', bottom: '4px', right: '4px', background: 'rgba(7,21,26,0.85)', color: 'var(--accent)', ...mono, fontSize: '9px', fontWeight: 700, padding: '1px 4px', borderRadius: '3px', border: '1px solid rgba(232,177,74,0.4)' }}>
            ×{c.deckCount}
          </div>
        </div>
      ))}
    </div>
  );
}

function CommanderRow({ c }: { c: CommanderStat }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      {c.image_url ? (
        <img src={c.image_url} alt={c.card_name} style={{ width: '40px', borderRadius: '4px', flexShrink: 0 }} loading="lazy" />
      ) : (
        <div style={{ width: '40px', height: '56px', background: 'var(--surface-2)', borderRadius: '4px', flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.card_name}</div>
        <div style={{ ...mono, fontSize: '10px', color: 'var(--text-faint)', marginTop: '2px' }}>
          {c.uses} deck{c.uses !== 1 ? 's' : ''}
          {c.games > 0 && ` · ${c.games} game${c.games !== 1 ? 's' : ''}`}
        </div>
      </div>
      {c.games > 0 && (
        <div style={{ ...mono, fontSize: '14px', fontWeight: 700, color: c.wins / c.games >= 0.5 ? '#54c08a' : '#e2645c', flexShrink: 0 }}>
          {Math.round((c.wins / c.games) * 100)}%
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StatsPage() {
  if (!migrated) { runMigrations(); migrated = true; }

  const user = await resolveActingUser();
  if (user.id === 'local') redirect('/login');

  const s = getPlayerStats(user.id);

  const winPctColor = s.games.winPct !== null
    ? (s.games.winPct >= 50 ? '#54c08a' : '#e2645c')
    : 'var(--text-faint)';

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem', color: 'var(--text)' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <p style={{ ...mono, fontSize: '11px', color: 'var(--accent)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
          Stats
        </p>
        <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
          Your Player Profile
        </h1>
        <p style={{ color: 'var(--text-faint)', fontSize: '12px' }}>
          Who you are as a Magic player — based on your decks, collection, and games.
        </p>
      </div>

      {/* Summary chips */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <StatChip label="Decks" value={String(s.totalDecks)} sub={s.publicDecks > 0 ? `${s.publicDecks} public` : undefined} accent />
        <StatChip label="Collection" value={s.collectionCards.toLocaleString()} sub={`${s.collectionUnique} unique`} />
        {s.collectionFoils > 0 && <StatChip label="Foils" value={String(s.collectionFoils)} />}
        {s.collectionValueUsd !== null && (
          <StatChip label="Est. Value" value={`$${s.collectionValueUsd.toFixed(0)}`} sub="USD" />
        )}
        {s.games.total > 0 && (
          <>
            <StatChip label="Games" value={String(s.games.total)} sub={`${s.games.wins}W / ${s.games.losses}L / ${s.games.draws}D`} />
            <div style={{ ...card, padding: '14px 18px', flex: '1 1 110px', minWidth: '110px' }}>
              <div style={{ fontSize: '10px', ...mono, color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>Win Rate</div>
              <div style={{ ...mono, fontSize: '22px', fontWeight: 700, color: winPctColor, lineHeight: 1 }}>
                {s.games.winPct !== null ? `${s.games.winPct}%` : '—'}
              </div>
              {s.games.avgTurns !== null && <div style={{ ...mono, fontSize: '9.5px', color: 'var(--text-faint)', marginTop: '4px' }}>avg {s.games.avgTurns} turns</div>}
            </div>
          </>
        )}
      </div>

      {/* Two-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        {/* Color identity */}
        <div style={card}>
          <div style={sectionLabel}>Color Identity</div>
          <ColorBars colors={s.colors} />
        </div>

        {/* Formats */}
        <div style={card}>
          <div style={sectionLabel}>Formats</div>
          <FormatTable formats={s.formats} />
        </div>
      </div>

      {/* Commanders */}
      {s.topCommanders.length > 0 && (
        <div style={{ ...card, marginBottom: '16px' }}>
          <div style={sectionLabel}>Commanders</div>
          <div>
            {s.topCommanders.map(c => <CommanderRow key={c.oracle_id} c={c} />)}
          </div>
        </div>
      )}

      {/* Most-played cards */}
      {s.topCards.length > 0 && (
        <div style={{ ...card, marginBottom: '16px' }}>
          <div style={sectionLabel}>Most-Played Cards</div>
          <CardGrid cards={s.topCards} />
        </div>
      )}

      {/* Opponent archetypes */}
      {s.archetypes.length > 0 && (
        <div style={card}>
          <div style={sectionLabel}>vs. Archetypes</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Archetype', 'Games', 'Win %'].map(h => (
                    <th key={h} style={{ ...mono, fontSize: '9.5px', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-faint)', padding: '6px 10px', textAlign: h === 'Archetype' ? 'left' : 'right', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.archetypes.map(a => (
                  <tr key={a.archetype} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', color: 'var(--text)' }}>{a.archetype}</td>
                    <td style={{ ...mono, padding: '8px 10px', textAlign: 'right', color: 'var(--text-faint)' }}>{a.games}</td>
                    <td style={{ ...mono, padding: '8px 10px', textAlign: 'right', color: a.winPct >= 50 ? '#54c08a' : '#e2645c', fontWeight: 600 }}>
                      {a.winPct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty game state nudge */}
      {s.games.total === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: '32px 24px', color: 'var(--text-faint)', fontSize: '13px', marginTop: '16px' }}>
          <div style={{ fontSize: '28px', marginBottom: '10px' }}>🎲</div>
          Log games from your deck builder to see win rates and matchup stats here.
        </div>
      )}
    </div>
  );
}
