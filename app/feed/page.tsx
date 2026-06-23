import { redirect } from 'next/navigation';
import { runMigrations } from '@/lib/db/migrations';
import { requireUser } from '@/lib/auth/session';
import { getActivityFeed } from '@/lib/social/store';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function FeedPage() {
  runMigrations();
  const user = await requireUser().catch(() => null);
  if (!user || user.id === 'local') redirect('/login');

  const feed = getActivityFeed(user.id);

  // Group by date
  const grouped: Record<string, typeof feed> = {};
  for (const item of feed) {
    const day = item.ts.slice(0, 10);
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(item);
  }

  const typeLabel: Record<string, string> = {
    deck_updated: 'updated a deck',
    like: 'liked a deck',
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '2rem 1.5rem', color: 'var(--text)' }}>
      <div style={{ marginBottom: '2rem' }}>
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'var(--accent)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
          Social
        </p>
        <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '4px' }}>Activity Feed</h1>
        <p style={{ color: 'var(--text-faint)', fontSize: '12px' }}>
          Recent activity from people you follow.
        </p>
      </div>

      {feed.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: '13px' }}>
          Nothing here yet — follow some users to see their activity.
          <br />
          <Link href="/decks/browse" style={{ color: 'var(--accent)', textDecoration: 'none', marginTop: 12, display: 'inline-block' }}>
            Browse public decks →
          </Link>
        </div>
      ) : (
        Object.entries(grouped).map(([day, items]) => (
          <div key={day} style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>
              {new Date(day).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((item, i) => (
                <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, color: 'var(--accent)',
                  }}>
                    {item.actor_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13 }}>
                      <Link href={`/u/${item.actor_username ?? item.actor_id}`} style={{ fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>
                        {item.actor_name}
                      </Link>
                      {' '}
                      <span style={{ color: 'var(--text-faint)' }}>{typeLabel[item.type] ?? item.type}:</span>
                      {' '}
                      <Link href={item.deck_slug ? `/d/${item.deck_slug}` : `/decks/${item.deck_id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                        {item.deck_name}
                      </Link>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>
                      {new Date(item.ts).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
