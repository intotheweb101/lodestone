/**
 * /card/[set]/[number] — Rich card permalink (Scryfall-style).
 * Server component: fetches from local DB + lazy-fetches rulings.
 * NZ price is a client component (live API call).
 */
import { notFound } from 'next/navigation';
import { runMigrations } from '@/lib/db/migrations';
import { getScryfallCardBySetNumber, getScryfallCardsByOracleId } from '@/lib/db/queries';
import { getRulings } from '@/lib/scryfall/rulings';
import type { ScryfallCard } from '@/lib/db/queries';
import { ManaIcon } from '@/components/ui';
import { NzPricePanel } from '@/components/nz-price-panel';
import { PriceSparkline } from '@/components/price-sparkline';
import { buildMatchKey } from '@/lib/match/normalize';
import { EdhrecPanel } from '@/components/edhrec-panel';
import { WishlistAddButton } from '@/components/wishlist-add-button';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

let migrated = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const RARITY_COLOR: Record<string, string> = {
  common: '#a9c0ba',
  uncommon: '#c0d0d8',
  rare: '#e8b14a',
  mythic: '#e2794a',
  special: '#a378d0',
};

const COLOR_BG: Record<string, string> = {
  W: '#f7efd2', U: '#a9def9', B: '#bcb4ad', R: '#f3a48b', G: '#93c8a6', C: '#c9c3bc',
};

const LEGAL_FORMATS = [
  'standard', 'pioneer', 'modern', 'legacy', 'vintage', 'pauper',
  'commander', 'oathbreaker', 'brawl', 'historicbrawl',
];
const FORMAT_LABELS: Record<string, string> = {
  standard: 'Standard', pioneer: 'Pioneer', modern: 'Modern',
  legacy: 'Legacy', vintage: 'Vintage', pauper: 'Pauper',
  commander: 'Commander', oathbreaker: 'Oathbreaker',
  brawl: 'Brawl', historicbrawl: 'Hist. Brawl',
};

function Dot() {
  return <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--border)', display: 'inline-block', flexShrink: 0 }} />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
      {children}
    </div>
  );
}

function LegalityGrid({ legalities }: { legalities: Record<string, string> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
      {LEGAL_FORMATS.map(fmt => {
        const status = legalities[fmt] ?? 'not_legal';
        const isLegal = status === 'legal' || status === 'restricted';
        return (
          <div key={fmt} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '6px', padding: '4px 8px', borderRadius: '5px',
            background: 'var(--surface-2)', fontSize: '11px',
          }}>
            <span style={{ color: 'var(--text-faint)' }}>{FORMAT_LABELS[fmt] ?? fmt}</span>
            <span style={{
              fontSize: '10px', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace",
              color: isLegal ? '#54c08a' : '#e2645c',
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              {status === 'restricted' ? 'rest' : isLegal ? 'legal' : 'not'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ManaCostDisplay({ cost }: { cost: string | null }) {
  if (!cost) return null;
  const symbols = cost.match(/\{[^}]+\}/g) ?? [];
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
      {symbols.map((s, i) => <ManaIcon key={i} symbol={s.slice(1, -1)} size={20} />)}
    </span>
  );
}

function ColorIdentityPips({ colors }: { colors: string[] }) {
  if (!colors.length) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {colors.map(c => (
        <span key={c} style={{
          width: 16, height: 16, borderRadius: '50%',
          background: COLOR_BG[c] ?? '#c9c3bc',
          border: '1px solid rgba(0,0,0,0.18)',
          boxShadow: 'inset 0 -1px 2px rgba(0,0,0,0.2)',
          flexShrink: 0, display: 'inline-block',
        }} title={c} />
      ))}
    </span>
  );
}

interface CardFace {
  name?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  mana_cost?: string;
  type_line?: string;
  image_uris?: Record<string, string>;
  colors?: string[];
}

function PriceVariants({ prices }: { prices: Record<string, string | null> }) {
  const entries: { label: string; key: string }[] = [
    { label: 'USD', key: 'usd' },
    { label: 'USD Foil', key: 'usd_foil' },
    { label: 'USD Etched', key: 'usd_etched' },
    { label: 'EUR', key: 'eur' },
    { label: 'EUR Foil', key: 'eur_foil' },
    { label: 'TIXES', key: 'tix' },
  ].filter(e => prices[e.key] != null);

  if (!entries.length) return <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>No price data</span>;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {entries.map(({ label, key }) => (
        <div key={key} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '6px 10px', minWidth: '80px' }}>
          <div style={{ fontSize: '9px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '2px' }}>{label}</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>${prices[key]}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CardPage({ params }: { params: Promise<{ set: string; number: string }> }) {
  if (!migrated) { runMigrations(); migrated = true; }

  const { set, number } = await params;
  const card: ScryfallCard | null = getScryfallCardBySetNumber(set, number);
  if (!card) notFound();

  const rulings = await getRulings(card.oracle_id, card.scryfall_id);
  const printings = getScryfallCardsByOracleId(card.oracle_id);

  const faces = card.card_faces as CardFace[] | null;
  const hasFaces = Array.isArray(faces) && faces.length >= 2;
  const frontFaceImage = hasFaces ? faces![0].image_uris?.normal ?? null : null;
  const backFaceImage = hasFaces ? faces![1].image_uris?.normal ?? null : null;
  const mainImage = card.image_uris?.normal ?? frontFaceImage;

  const rarityColor = RARITY_COLOR[card.rarity ?? ''] ?? 'var(--text-faint)';

  // Treatment badges to show
  const treatments: string[] = [];
  if (card.border_color && card.border_color !== 'black') treatments.push(card.border_color);
  if (card.full_art) treatments.push('full art');
  for (const fe of card.frame_effects ?? []) {
    if (fe !== 'legendary' && fe !== 'none') treatments.push(fe);
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px', color: 'var(--text)' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginBottom: '20px', display: 'flex', gap: '8px', alignItems: 'center', fontFamily: "'IBM Plex Mono', monospace" }}>
        <Link href="/" style={{ color: 'var(--text-faint)', textDecoration: 'none' }}>Search</Link>
        <span>/</span>
        <Link href={`/search?q=s:${card.set_code}`} style={{ color: 'var(--text-faint)', textDecoration: 'none' }}>
          {card.set_name ?? card.set_code.toUpperCase()}
        </Link>
        <span>/</span>
        <span style={{ color: 'var(--text-muted)' }}>{card.name}</span>
      </div>

      {/* Main two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '36px', alignItems: 'start' }}>

        {/* ── Left: image(s) + NZ price ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {mainImage && (
            <img
              src={mainImage}
              alt={card.name}
              style={{ width: '100%', borderRadius: '14px', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
            />
          )}
          {backFaceImage && (
            <div>
              <div style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px' }}>Back face</div>
              <img
                src={backFaceImage}
                alt={`${card.name} — back`}
                style={{ width: '100%', borderRadius: '14px', border: '1px solid var(--border)', opacity: 0.9 }}
              />
            </div>
          )}

          {/* NZ shop prices — client component */}
          <NzPricePanel
            setCode={card.set_code}
            collectorNumber={card.collector_number}
            finishes={card.finishes}
            scryfallPrices={card.prices}
          />

          {/* Wishlist */}
          <WishlistAddButton
            oracleId={card.oracle_id}
            scryfallId={card.scryfall_id}
            cardName={card.name}
            finish={card.finishes.includes('nonfoil') ? 'nonfoil' : card.finishes.includes('foil') ? 'foil' : 'etched'}
          />

          {/* Price history sparkline — uses the default finish (nonfoil if available) */}
          {(() => {
            const defaultFinish = (card.finishes.includes('nonfoil') ? 'nonfoil' : card.finishes[0] ?? 'nonfoil') as 'nonfoil' | 'foil' | 'etched';
            const matchKey = buildMatchKey(card.set_code, card.collector_number, defaultFinish);
            return (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
                <PriceSparkline matchKey={matchKey} days={90} />
              </div>
            );
          })()}

          {/* Global market prices */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
            <SectionLabel>Market prices (TCGPlayer / Cardmarket)</SectionLabel>
            <PriceVariants prices={card.prices} />
          </div>
        </div>

        {/* ── Right: all card details ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Name + mana cost */}
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{card.name}</h1>
              {card.mana_cost && <ManaCostDisplay cost={card.mana_cost} />}
            </div>

            {/* Type + meta row */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
              {card.type_line && (
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{card.type_line}</span>
              )}
              <Dot />
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: rarityColor, fontWeight: 600, textTransform: 'capitalize' }}>
                {card.rarity}
              </span>
              <Dot />
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'var(--text-faint)' }}>
                {card.set_name ?? card.set_code.toUpperCase()} #{card.collector_number}
              </span>
              {card.artist && (
                <>
                  <Dot />
                  <span style={{ fontSize: '11px', color: 'var(--text-faint)', fontStyle: 'italic' }}>Illus. {card.artist}</span>
                </>
              )}
            </div>

            {/* Color identity + treatment row */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
              {card.color_identity.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.5px' }}>Identity:</span>
                  <ColorIdentityPips colors={card.color_identity} />
                </div>
              )}
              {card.finishes.length > 0 && (
                <div style={{ display: 'flex', gap: '4px' }}>
                  {card.finishes.map(f => (
                    <span key={f} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: f === 'foil' ? 'rgba(160,130,220,0.15)' : 'var(--surface-2)', color: f === 'foil' ? '#c0a0e0' : 'var(--text-faint)', border: f === 'foil' ? '1px solid rgba(160,130,220,0.3)' : '1px solid var(--border)', fontFamily: "'IBM Plex Mono', monospace" }}>
                      {f}
                    </span>
                  ))}
                </div>
              )}
              {treatments.map(t => (
                <span key={t} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(232,177,74,0.1)', color: 'var(--accent)', border: '1px solid rgba(232,177,74,0.25)', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Oracle text (single-face card) */}
          {!hasFaces && card.oracle_text && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px' }}>
              <div style={{ fontSize: '13.5px', color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {card.oracle_text}
              </div>
              {(card.power || card.loyalty) && (
                <div style={{ marginTop: '10px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '15px', fontWeight: 700, color: 'var(--accent)', textAlign: 'right' }}>
                  {card.power ? `${card.power}/${card.toughness}` : `◈ ${card.loyalty}`}
                </div>
              )}
            </div>
          )}

          {/* DFC face oracle texts */}
          {hasFaces && faces!.map((face, i) => face.oracle_text ? (
            <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                  {face.name ?? (i === 0 ? 'Front' : 'Back')}
                </span>
                {face.mana_cost && <ManaCostDisplay cost={face.mana_cost} />}
              </div>
              {face.type_line && <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginBottom: '8px' }}>{face.type_line}</div>}
              <div style={{ fontSize: '13.5px', color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{face.oracle_text}</div>
              {(face.power || face.loyalty) && (
                <div style={{ marginTop: '8px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '15px', fontWeight: 700, color: 'var(--accent)', textAlign: 'right' }}>
                  {face.power ? `${face.power}/${face.toughness}` : `◈ ${face.loyalty}`}
                </div>
              )}
            </div>
          ) : null)}

          {/* Flavor text */}
          {card.flavor_text && (
            <div style={{ fontStyle: 'italic', fontSize: '12.5px', color: 'var(--text-faint)', lineHeight: 1.65, padding: '0 4px', borderLeft: '3px solid var(--border)' }}>
              {card.flavor_text}
            </div>
          )}

          {/* Keywords */}
          {card.keywords.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {card.keywords.map(kw => (
                <span key={kw} style={{
                  fontSize: '11px', padding: '3px 10px', borderRadius: '20px',
                  background: 'var(--surface-2)', color: 'var(--text-muted)',
                  border: '1px solid var(--border)', fontWeight: 500,
                }}>
                  {kw}
                </span>
              ))}
            </div>
          )}

          {/* Stats row: CMC + P/T or Loyalty + Released */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {card.cmc != null && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px' }}>
                <div style={{ fontSize: '9px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '3px' }}>CMC</div>
                <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>{card.cmc}</div>
              </div>
            )}
            {card.power && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px' }}>
                <div style={{ fontSize: '9px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '3px' }}>P/T</div>
                <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>{card.power}/{card.toughness}</div>
              </div>
            )}
            {card.loyalty && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px' }}>
                <div style={{ fontSize: '9px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '3px' }}>Loyalty</div>
                <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>◈ {card.loyalty}</div>
              </div>
            )}
            {card.released_at && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px' }}>
                <div style={{ fontSize: '9px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '3px' }}>Released</div>
                <div style={{ fontSize: '13px', fontFamily: "'IBM Plex Mono', monospace" }}>{card.released_at}</div>
              </div>
            )}
          </div>

          {/* Format legality */}
          <div>
            <SectionLabel>Format legality</SectionLabel>
            <LegalityGrid legalities={card.legalities} />
          </div>

          {/* EDHREC data */}
          <EdhrecPanel oracleId={card.oracle_id} cardName={card.name} />

          {/* Rulings */}
          {rulings.length > 0 && (
            <div>
              <SectionLabel>Rulings ({rulings.length})</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {rulings.map((r, i) => (
                  <div key={i} style={{ padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', marginBottom: '4px' }}>{r.published_at} · {r.source}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>{r.comment}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Other printings */}
          {printings.length > 1 && (
            <div>
              <SectionLabel>Other printings ({printings.length})</SectionLabel>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {printings.slice(0, 24).map(p => {
                  const isCurrent = p.scryfall_id === card.scryfall_id;
                  return (
                    <Link
                      key={p.scryfall_id}
                      href={`/card/${p.set_code}/${p.collector_number}`}
                      style={{
                        padding: '4px 10px', borderRadius: '6px',
                        background: isCurrent ? 'var(--accent-glow)' : 'var(--surface)',
                        border: isCurrent ? '1px solid var(--accent)' : '1px solid var(--border)',
                        color: isCurrent ? 'var(--accent)' : 'var(--text-muted)',
                        textDecoration: 'none', fontSize: '11px',
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontWeight: isCurrent ? 700 : 400,
                      }}
                    >
                      {p.set_code.toUpperCase()} #{p.collector_number}
                    </Link>
                  );
                })}
                {printings.length > 24 && (
                  <span style={{ fontSize: '11px', color: 'var(--text-faint)', padding: '4px 0' }}>+{printings.length - 24} more</span>
                )}
              </div>
            </div>
          )}

          {/* External links */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', paddingTop: '4px', borderTop: '1px solid var(--border)' }}>
            <a href={`https://scryfall.com/card/${card.set_code}/${card.collector_number}`} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: '12px', color: 'var(--accent)', fontFamily: "'IBM Plex Mono', monospace", textDecoration: 'none' }}>
              Scryfall ↗
            </a>
            <a href={`https://edhrec.com/cards/${card.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')}`} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: '12px', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace", textDecoration: 'none' }}>
              EDHREC ↗
            </a>
            <a href={`https://www.moxfield.com/cards/${card.scryfall_id}`} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: '12px', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace", textDecoration: 'none' }}>
              Moxfield ↗
            </a>
            <a href={`https://www.mtgsingles.co.nz/card/${encodeURIComponent(card.name)}`} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: '12px', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace", textDecoration: 'none' }}>
              MTG Singles ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
