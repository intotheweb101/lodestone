import { redirect } from 'next/navigation';
import { runMigrations } from '@/lib/db/migrations';
import { resolveActingUser } from '@/lib/auth/session';
import { getCollectionWithCards } from '@/lib/collection/store';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

let migrated = false;

export default async function CollectionPage() {
  if (!migrated) { runMigrations(); migrated = true; }

  const user = await resolveActingUser();
  if (user.id === 'local') redirect('/login');

  const entries = getCollectionWithCards(user.id);

  const totalCards = entries.reduce((s, e) => s + e.quantity, 0);
  const uniqueCards = entries.length;
  const foilCount = entries.filter(e => e.foil).reduce((s, e) => s + e.quantity, 0);
  const estValueUsd = entries.reduce((s, e) => e.price_usd != null ? s + e.price_usd * e.quantity : s, 0);
  const pricedCount = entries.filter(e => e.price_usd != null).length;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem', color: 'var(--text)' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'var(--accent)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
          Collection
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
            My Collection
          </h1>
          <Link href="/collection/import" style={{
            padding: '6px 16px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
            background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--accent)',
            textDecoration: 'none', fontFamily: "'IBM Plex Sans', sans-serif",
          }}>
            Import CSV
          </Link>
        </div>
        <p style={{ color: 'var(--text-faint)', fontSize: '12px', marginTop: 4 }}>
          Cards you own across all your decks.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '2rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Total cards', value: totalCards.toLocaleString() },
          { label: 'Unique cards', value: uniqueCards.toLocaleString() },
          { label: 'Foils', value: foilCount.toLocaleString() },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '12px 18px', minWidth: '110px',
          }}>
            <div style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>
              {stat.label}
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '20px', fontWeight: 700, color: 'var(--accent)' }}>
              {stat.value}
            </div>
          </div>
        ))}
        {/* Est. value chip — only if we have at least one priced card */}
        {pricedCount > 0 && (
          <div style={{
            background: 'var(--surface)', border: '1px solid #2a5040',
            borderRadius: '10px', padding: '12px 18px', minWidth: '140px',
          }}>
            <div style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>
              Est. value (USD)
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '20px', fontWeight: 700, color: '#54c08a' }}>
              ${estValueUsd.toFixed(2)}
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace", marginTop: '2px' }}>
              {pricedCount}/{uniqueCards} cards priced
            </div>
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        /* Empty state */
        <div style={{ textAlign: 'center', padding: '64px 24px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>🃏</div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>No cards yet</h2>
          <p style={{ color: 'var(--text-faint)', fontSize: '13px', maxWidth: '360px', margin: '0 auto 24px', lineHeight: 1.6 }}>
            Mark cards as owned in your deck builder and they'll appear here.
          </p>
          <Link href="/decks" style={{
            display: 'inline-block', padding: '10px 20px',
            background: 'var(--accent)', color: '#0a1f22',
            borderRadius: '9px', textDecoration: 'none',
            fontWeight: 700, fontSize: '14px',
          }}>
            Go to My Decks →
          </Link>
        </div>
      ) : (
        /* Card grid */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: '14px',
        }}>
          {entries.map(entry => {
            const href = entry.set_code && entry.collector_number
              ? `/card/${entry.set_code}/${entry.collector_number}`
              : '#';
            return (
              <Link key={`${entry.oracle_id}-${entry.foil ? 'foil' : 'nf'}`} href={href} style={{ textDecoration: 'none', color: 'var(--text)' }}>
                <div style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: '10px', overflow: 'hidden',
                  transition: 'border-color 0.15s',
                  position: 'relative',
                }}>
                  {/* Card image */}
                  {entry.image_url ? (
                    <img
                      src={entry.image_url}
                      alt={entry.name}
                      style={{ width: '100%', display: 'block', aspectRatio: '0.717', objectFit: 'cover' }}
                      loading="lazy"
                    />
                  ) : (
                    <div style={{
                      width: '100%', aspectRatio: '0.717',
                      background: 'var(--surface-2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--text-faint)', fontSize: '11px',
                    }}>
                      No image
                    </div>
                  )}

                  {/* Quantity badge */}
                  <div style={{
                    position: 'absolute', top: '6px', right: '6px',
                    background: 'rgba(7,21,26,0.85)', color: 'var(--accent)',
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: '11px', fontWeight: 700,
                    padding: '1px 5px', borderRadius: '4px',
                    border: '1px solid rgba(232,177,74,0.4)',
                  }}>
                    ×{entry.quantity}
                  </div>

                  {/* Foil badge */}
                  {entry.foil && (
                    <div style={{
                      position: 'absolute', top: '6px', left: '6px',
                      background: 'linear-gradient(120deg,#7b6bd6,#d67ba8,#e8b14a)',
                      fontSize: '8px', fontWeight: 700,
                      padding: '1px 5px', borderRadius: '4px',
                      color: '#fff', letterSpacing: '0.5px',
                    }}>
                      FOIL
                    </div>
                  )}

                  {/* Card name + price */}
                  <div style={{ padding: '6px 8px' }}>
                    <div style={{
                      fontSize: '11px', fontWeight: 600,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      color: 'var(--text)',
                    }}>
                      {entry.name}
                    </div>
                    {entry.type_line && (
                      <div style={{
                        fontSize: '9.5px', color: 'var(--text-faint)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        marginTop: '1px',
                      }}>
                        {entry.type_line.split('—')[0].trim()}
                      </div>
                    )}
                    {entry.price_usd != null && (
                      <div style={{
                        fontSize: '9.5px', fontFamily: "'IBM Plex Mono', monospace",
                        color: '#54c08a', fontWeight: 600, marginTop: '2px',
                      }}>
                        ${entry.price_usd.toFixed(2)}
                        {entry.quantity > 1 && (
                          <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>
                            {' '}× {entry.quantity} = ${(entry.price_usd * entry.quantity).toFixed(2)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
