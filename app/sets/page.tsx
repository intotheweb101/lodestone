import { runMigrations } from '@/lib/db/migrations';
import { listSets } from '@/lib/db/queries';
import type { SetRow } from '@/lib/db/queries';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

let migrated = false;

const SET_TYPE_LABEL: Record<string, string> = {
  core:          'Core',
  expansion:     'Expansion',
  masters:       'Masters',
  commander:     'Commander',
  draft_innovation: 'Draft',
  funny:         'Funny',
  starter:       'Starter',
  box:           'Box',
  promo:         'Promo',
  token:         'Token',
  memorabilia:   'Memorabilia',
  arsenal:       'Arsenal',
  from_the_vault: 'FTV',
  spellbook:     'Spellbook',
  premium_deck:  'Premium',
  duel_deck:     'Duel Deck',
  planechase:    'Planechase',
  archenemy:     'Archenemy',
  vanguard:      'Vanguard',
  treasure_chest: 'Treasure Chest',
  minigame:      'Mini-game',
};

const MAIN_TYPES = new Set(['core', 'expansion', 'masters', 'draft_innovation', 'commander']);

export default async function SetsPage() {
  if (!migrated) { runMigrations(); migrated = true; }

  const all = listSets();
  const today = new Date().toISOString().slice(0, 10);

  const upcoming = all.filter(s => s.released_at && s.released_at > today);
  const recent   = all.filter(s => s.released_at && s.released_at <= today && MAIN_TYPES.has(s.set_type ?? ''));
  const other    = all.filter(s => !MAIN_TYPES.has(s.set_type ?? '') && (!s.released_at || s.released_at <= today));

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem', color: 'var(--text)' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'var(--accent)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
          Sets & Spoilers
        </p>
        <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
          Magic Sets
        </h1>
        <p style={{ color: 'var(--text-faint)', fontSize: '12px', margin: 0 }}>
          {all.length} sets · upcoming sets shown first
        </p>
      </div>

      {all.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '56px 24px',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>
            No sets in database yet
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-faint)', marginBottom: '16px' }}>
            Run a Scryfall sync from the admin panel to populate sets and cards.
          </div>
          <a
            href="/admin"
            style={{
              display: 'inline-block', padding: '8px 20px', borderRadius: '8px',
              background: 'var(--accent)', color: '#0a1f22',
              fontWeight: 700, fontSize: '13px', textDecoration: 'none',
            }}
          >
            Go to Admin →
          </a>
        </div>
      ) : (
        <>
          {/* Upcoming / spoilers */}
          {upcoming.length > 0 && (
            <section style={{ marginBottom: '2.5rem' }}>
              <SectionHeading label="Upcoming" accent />
              <SetGrid sets={upcoming} />
            </section>
          )}

          {/* Main sets */}
          {recent.length > 0 && (
            <section style={{ marginBottom: '2.5rem' }}>
              <SectionHeading label="Sets & Expansions" />
              <SetGrid sets={recent} />
            </section>
          )}

          {/* Everything else */}
          {other.length > 0 && (
            <section>
              <SectionHeading label="Other Products" />
              <SetGrid sets={other} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function SectionHeading({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <div style={{
      fontSize: '9.5px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase',
      fontFamily: "'IBM Plex Mono', monospace",
      color: accent ? 'var(--accent)' : 'var(--text-faint)',
      marginBottom: '12px',
    }}>
      {label}
    </div>
  );
}

function SetGrid({ sets }: { sets: SetRow[] }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: '10px',
    }}>
      {sets.map(s => <SetCard key={s.code} set={s} />)}
    </div>
  );
}

function SetCard({ set: s }: { set: SetRow }) {
  const typeLabel = SET_TYPE_LABEL[s.set_type ?? ''] ?? s.set_type ?? 'Set';
  const year = s.released_at ? s.released_at.slice(0, 4) : null;

  return (
    <Link href={`/sets/${s.code}`} style={{ textDecoration: 'none', color: 'var(--text)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '10px', padding: '12px 14px',
        transition: 'border-color 0.12s',
      }}>
        {/* Set icon */}
        <div style={{
          width: '32px', height: '32px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--surface-2)', borderRadius: '6px',
          overflow: 'hidden',
        }}>
          {s.icon_svg_uri ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={s.icon_svg_uri}
              alt=""
              aria-hidden
              width={22}
              height={22}
              style={{ filter: 'invert(70%) sepia(20%) saturate(400%) hue-rotate(130deg)', opacity: 0.9 }}
            />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden
              stroke="var(--text-faint)" strokeWidth="1.5">
              <polygon points="12,2 22,8 22,16 12,22 2,16 2,8" />
            </svg>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '12.5px', fontWeight: 600, color: 'var(--text)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            lineHeight: 1.25,
          }}>
            {s.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '9.5px', padding: '1px 5px', borderRadius: '3px',
              background: 'var(--surface-3)', color: 'var(--text-faint)',
              fontFamily: "'IBM Plex Mono', monospace", textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              {typeLabel}
            </span>
            {year && (
              <span style={{ fontSize: '10px', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
                {year}
              </span>
            )}
            {s.card_count != null && (
              <span style={{ fontSize: '10px', color: 'var(--text-faintest)', fontFamily: "'IBM Plex Mono', monospace" }}>
                {s.card_count}c
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
