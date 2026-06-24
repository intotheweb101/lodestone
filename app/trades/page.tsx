/**
 * /trades — Trade binder matching page.
 * Shows cards you have for trade that others want, and cards on your wishlist
 * that others have marked for trade.
 */

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { runMigrations } from '@/lib/db/migrations';
import { getTradeMatches } from '@/lib/collection/store';

export const dynamic = 'force-dynamic';

export default async function TradesPage() {
  runMigrations();
  const user = await getCurrentUser();
  if (!user || user.id === 'local') redirect('/login');

  const { myTradesWanted, othersHaveWanted } = getTradeMatches(user.id);

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontFamily: "'Pirata One', cursive", fontSize: '28px', color: '#f4f0e6', marginBottom: '4px' }}>
        Trade Binder
      </h1>
      <p style={{ color: '#6f8a85', fontSize: '13.5px', marginBottom: '32px', lineHeight: 1.5 }}>
        Mark cards in your <a href="/collection" style={{ color: '#e8b14a' }}>collection</a> as "for trade" to appear here.
        Cards on others' wishlists that match yours are listed below.
      </p>

      {myTradesWanted.length === 0 && othersHaveWanted.length === 0 && (
        <div style={{ background: '#0f2a2c', border: '1px solid #1d4441', borderRadius: '12px', padding: '40px', textAlign: 'center', color: '#5f7a76' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔄</div>
          <p style={{ marginBottom: '8px' }}>No matches yet.</p>
          <p style={{ fontSize: '13px' }}>
            Mark cards in your <a href="/collection" style={{ color: '#e8b14a' }}>collection</a> as "for trade", or add cards to your <a href="/wishlist" style={{ color: '#e8b14a' }}>wishlist</a> to find matches.
          </p>
        </div>
      )}

      {/* Cards I have for trade that others want */}
      {myTradesWanted.length > 0 && (
        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '13px', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '1.5px', textTransform: 'uppercase', color: '#2e5551', marginBottom: '16px' }}>
            Your trade cards — wanted by others ({myTradesWanted.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {myTradesWanted.map(match => (
              <TradeRow
                key={match.oracle_id}
                cardName={match.card_name}
                imageUrl={match.image_url}
                people={match.wanted_by}
                direction="wanted"
              />
            ))}
          </div>
        </section>
      )}

      {/* Cards on my wishlist that others have for trade */}
      {othersHaveWanted.length > 0 && (
        <section>
          <h2 style={{ fontSize: '13px', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '1.5px', textTransform: 'uppercase', color: '#2e5551', marginBottom: '16px' }}>
            Your wishlist — available for trade ({othersHaveWanted.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {othersHaveWanted.map(match => (
              <TradeRow
                key={match.oracle_id}
                cardName={match.card_name}
                imageUrl={match.image_url}
                people={match.offered_by}
                direction="offered"
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TradeRow({
  cardName,
  imageUrl,
  people,
  direction,
}: {
  cardName: string;
  imageUrl: string | null;
  people: { user_id: string; username: string | null; name: string }[];
  direction: 'wanted' | 'offered';
}) {
  const verb = direction === 'wanted' ? 'wants it' : 'has it';
  return (
    <div style={{ background: '#0f2a2c', border: '1px solid #1d4441', borderRadius: '10px', padding: '14px 16px', display: 'flex', gap: '14px', alignItems: 'center' }}>
      {imageUrl && (
        <img src={imageUrl} alt={cardName} style={{ width: '40px', borderRadius: '4px', flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: '#eef3f0', fontSize: '14px', marginBottom: '6px' }}>{cardName}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {people.map(p => (
            <a
              key={p.user_id}
              href={p.username ? `/u/${p.username}` : '#'}
              style={{ fontSize: '12px', background: direction === 'wanted' ? 'rgba(232,177,74,0.12)' : 'rgba(72,200,160,0.12)', border: `1px solid ${direction === 'wanted' ? 'rgba(232,177,74,0.3)' : 'rgba(72,200,160,0.3)'}`, borderRadius: '6px', padding: '3px 8px', color: direction === 'wanted' ? '#e8b14a' : '#48c8a0', textDecoration: 'none' }}
            >
              {p.username ?? p.name} {verb}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
