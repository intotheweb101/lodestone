import { notFound } from 'next/navigation';
import { runMigrations } from '@/lib/db/migrations';
import { getCardsInSet, listSets } from '@/lib/db/queries';
import type { ScryfallCard } from '@/lib/db/queries';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

let migrated = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  return { title: `${code.toUpperCase()} — Lodestone` };
}

export default async function SetPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  if (!migrated) { runMigrations(); migrated = true; }

  const { code } = await params;
  const setCode = code.toLowerCase();

  // Resolve set metadata from the sets table
  const setRow = listSets().find(s => s.code === setCode);
  const cards = getCardsInSet(setCode);

  if (cards.length === 0 && !setRow) notFound();

  const setName = setRow?.name ?? code.toUpperCase();
  const setType = setRow?.set_type ?? null;
  const releasedAt = setRow?.released_at ?? null;
  const cardCount = cards.length;

  const rarityOrder: Record<string, number> = { mythic: 0, rare: 1, uncommon: 2, common: 3, special: 4, bonus: 5 };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem', color: 'var(--text)' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.25rem', fontSize: '12px', color: 'var(--text-faint)' }}>
        <Link href="/sets" style={{ color: 'var(--text-faint)', textDecoration: 'none' }}>Sets</Link>
        <span>/</span>
        <span style={{ color: 'var(--text-muted)' }}>{setName}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '1.75rem' }}>
        {setRow?.icon_svg_uri && (
          <div style={{
            width: '44px', height: '44px', flexShrink: 0,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={setRow.icon_svg_uri}
              alt=""
              aria-hidden
              width={28}
              height={28}
              style={{ filter: 'invert(70%) sepia(20%) saturate(400%) hue-rotate(130deg)' }}
            />
          </div>
        )}
        <div>
          <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'var(--accent)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>
            {code.toUpperCase()} {setType ? `· ${setType.replace(/_/g, ' ')}` : ''}
          </p>
          <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
            {setName}
          </h1>
          <p style={{ color: 'var(--text-faint)', fontSize: '12px', margin: 0 }}>
            {cardCount} cards
            {releasedAt && ` · released ${releasedAt}`}
          </p>
        </div>
      </div>

      {/* Rarity sections */}
      {(['mythic', 'rare', 'uncommon', 'common', 'special', 'bonus'] as const).map(rarity => {
        const group = cards
          .filter(c => c.rarity === rarity)
          .sort((a, b) => (rarityOrder[a.rarity ?? ''] ?? 9) - (rarityOrder[b.rarity ?? ''] ?? 9));
        if (group.length === 0) return null;
        return (
          <RaritySection key={rarity} rarity={rarity} cards={group} />
        );
      })}

      {/* Any cards with unknown rarity */}
      {(() => {
        const known = new Set(['mythic', 'rare', 'uncommon', 'common', 'special', 'bonus']);
        const rest = cards.filter(c => !known.has(c.rarity ?? ''));
        if (rest.length === 0) return null;
        return <RaritySection rarity="other" cards={rest} />;
      })()}
    </div>
  );
}

const RARITY_COLOR: Record<string, string> = {
  mythic:   '#e07040',
  rare:     '#c4a44a',
  uncommon: '#9ab2b8',
  common:   'var(--text-faint)',
  special:  '#b080d0',
  bonus:    '#70a0e0',
  other:    'var(--text-faint)',
};

function RaritySection({ rarity, cards }: { rarity: string; cards: ScryfallCard[] }) {
  return (
    <section style={{ marginBottom: '2rem' }}>
      <div style={{
        fontSize: '9.5px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'capitalize',
        fontFamily: "'IBM Plex Mono', monospace",
        color: RARITY_COLOR[rarity] ?? 'var(--text-faint)',
        marginBottom: '10px',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        {rarity}
        <span style={{ color: 'var(--text-faintest)', fontWeight: 400 }}>({cards.length})</span>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
        gap: '10px',
      }}>
        {cards.map(card => <SetCardTile key={card.scryfall_id} card={card} />)}
      </div>
    </section>
  );
}

function SetCardTile({ card }: { card: ScryfallCard }) {
  const imageUrl = card.image_uris?.normal ?? card.image_uris?.small ?? null;
  const priceRaw = card.prices?.usd ?? null;
  const priceUsd = priceRaw ? parseFloat(priceRaw) : null;

  return (
    <Link
      href={`/card/${card.set_code}/${card.collector_number}`}
      style={{ textDecoration: 'none', color: 'var(--text)' }}
    >
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '10px', overflow: 'hidden',
        transition: 'border-color 0.12s',
        position: 'relative',
      }}>
        {imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imageUrl}
            alt={card.name}
            style={{ width: '100%', display: 'block', aspectRatio: '0.717', objectFit: 'cover' }}
            loading="lazy"
          />
        ) : (
          <div style={{
            width: '100%', aspectRatio: '0.717',
            background: 'var(--surface-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '10px', color: 'var(--text-faint)',
          }}>
            {card.name}
          </div>
        )}

        {/* Collector number badge */}
        <div style={{
          position: 'absolute', top: '5px', left: '5px',
          background: 'rgba(7,21,26,0.82)',
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '9px', fontWeight: 600, color: 'var(--text-faint)',
          padding: '1px 4px', borderRadius: '3px',
        }}>
          #{card.collector_number}
        </div>

        <div style={{ padding: '5px 8px 7px' }}>
          <div style={{
            fontSize: '10.5px', fontWeight: 600, color: 'var(--text)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {card.name}
          </div>
          {priceUsd != null && (
            <div style={{
              fontSize: '9.5px', fontFamily: "'IBM Plex Mono', monospace",
              color: '#54c08a', fontWeight: 600, marginTop: '1px',
            }}>
              ${priceUsd.toFixed(2)}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
