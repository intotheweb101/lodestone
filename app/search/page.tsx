import Link from 'next/link';
import { runMigrations } from '@/lib/db/migrations';
import { searchScryfallAdvanced } from '@/lib/db/queries';
import { SearchFilters } from '@/components/search-filters';
import { SearchResults } from '@/components/search-results';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const q = (params.q ?? '').trim();
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const PAGE_SIZE = 60;

  runMigrations();

  const result = q.length >= 2
    ? searchScryfallAdvanced(q, { limit: PAGE_SIZE, page })
    : { cards: [], total: null, page, pageSize: PAGE_SIZE, errors: [] };

  const { cards, errors } = result;

  const prevUrl = page > 1 ? `/search?q=${encodeURIComponent(q)}&page=${page - 1}` : null;
  const nextUrl = cards.length === PAGE_SIZE ? `/search?q=${encodeURIComponent(q)}&page=${page + 1}` : null;

  return (
    <div style={{ minHeight: '100dvh', background: '#07151a', color: '#eef3f0', fontFamily: "'IBM Plex Sans', sans-serif" }}>

      {/* Top bar */}
      <div style={{
        height: '56px', display: 'flex', alignItems: 'center', gap: '16px',
        padding: '0 28px', borderBottom: '1px solid #173a38',
        position: 'sticky', top: 0, background: '#07151a', zIndex: 10,
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', color: '#6f8a85', fontSize: '13px' }}>
          ← Home
        </Link>
        <span style={{ color: '#3f5d59' }}>/</span>
        <span style={{ color: '#9bb3ad', fontSize: '13px' }}>Search</span>
        {q && (
          <>
            <span style={{ color: '#3f5d59' }}>/</span>
            <span style={{ color: '#f4c463', fontSize: '13px', fontWeight: 600 }}>&ldquo;{q}&rdquo;</span>
          </>
        )}
        <span style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono', monospace", fontSize: '11.5px', color: '#6f8a85' }}>
          {cards.length > 0 ? `${cards.length}${cards.length === PAGE_SIZE ? '+' : ''} results${page > 1 ? ` · p${page}` : ''}` : ''}
        </span>
      </div>

      {/* Search form + filters */}
      <div style={{ padding: '28px 36px 0' }}>
        <form action="/search" method="get">
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            background: '#0e292b', border: '1.5px solid #214a47', borderRadius: '12px',
            padding: '12px 16px', maxWidth: '680px',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6f8a85" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" />
            </svg>
            <input
              name="q"
              defaultValue={q}
              autoFocus
              autoComplete="off"
              placeholder="t:creature c:wu mv<=3 · o:flying · r:rare f:commander…"
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: '#eef3f0', fontSize: '15px', fontFamily: "'IBM Plex Sans', sans-serif",
              }}
            />
            <button type="submit" style={{
              padding: '6px 16px', background: '#e8b14a', border: 'none',
              borderRadius: '8px', cursor: 'pointer', fontWeight: 700,
              fontSize: '13px', color: '#0a1f22', fontFamily: "'IBM Plex Sans', sans-serif",
            }}>
              Search
            </button>
          </div>

          {/* Syntax help disclosure */}
          <details style={{ marginTop: 10, maxWidth: 680 }}>
            <summary style={{ fontSize: 12, color: '#6f8a85', cursor: 'pointer', userSelect: 'none' }}>
              Syntax help
            </summary>
            <div style={{
              marginTop: 8, padding: '12px 16px', background: '#0e292b',
              border: '1px solid #173a38', borderRadius: 8, fontSize: 12,
              color: '#8aa39d', lineHeight: 1.8,
            }}>
              <code style={{ color: '#e8b14a' }}>t:creature</code> · type &nbsp;
              <code style={{ color: '#e8b14a' }}>c:wu</code> · colors &nbsp;
              <code style={{ color: '#e8b14a' }}>id:grixis</code> · color identity &nbsp;
              <code style={{ color: '#e8b14a' }}>mv&lt;=3</code> · mana value <br />
              <code style={{ color: '#e8b14a' }}>o:flying</code> · oracle text &nbsp;
              <code style={{ color: '#e8b14a' }}>r:rare</code> · rarity &nbsp;
              <code style={{ color: '#e8b14a' }}>f:commander</code> · format legal &nbsp;
              <code style={{ color: '#e8b14a' }}>s:mh3</code> · set <br />
              <code style={{ color: '#e8b14a' }}>pow&gt;=3</code> · power &nbsp;
              <code style={{ color: '#e8b14a' }}>is:fullart</code> · flags &nbsp;
              <code style={{ color: '#e8b14a' }}>kw:flying</code> · keyword &nbsp;
              <code style={{ color: '#e8b14a' }}>-t:land</code> · negation <br />
              <code style={{ color: '#e8b14a' }}>order:cmc</code> · sort &nbsp;
              <code style={{ color: '#e8b14a' }}>dir:desc</code> · direction &nbsp;
              Combine freely: <code style={{ color: '#e8b14a' }}>t:creature c:wu mv&lt;=3 o:flying r&gt;=rare</code>
            </div>
          </details>
        </form>

        {/* Filter chips (client component — rewrites q and submits) */}
        <SearchFilters currentQuery={q} />
      </div>

      {/* Error banner */}
      {errors.length > 0 && (
        <div style={{
          margin: '16px 36px 0', padding: '10px 14px',
          background: '#1a2e0e', border: '1px solid #2d4a1a',
          borderRadius: 8, fontSize: 12, color: '#8aa33d',
        }}>
          ⚠ {errors.join(' · ')}
        </div>
      )}

      {/* Results grid */}
      <div style={{ padding: '24px 36px 56px' }}>
        {!q && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#6f8a85' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>⬡</div>
            <p style={{ fontSize: '15px' }}>Enter a card name or use filters above to search</p>
            <p style={{ fontSize: '13px', marginTop: 8, color: '#4a6660' }}>
              Try: <em>t:creature c:wu mv&lt;=3</em> · <em>o:&quot;draw a card&quot; r:rare</em>
            </p>
          </div>
        )}

        {q && cards.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px', color: '#3f5d59' }}>—</div>
            <p style={{ fontSize: '15px', color: '#6f8a85' }}>No cards found for &ldquo;{q}&rdquo;</p>
            <p style={{ fontSize: '13px', color: '#4a6660', marginTop: '6px' }}>
              Try a different spelling, adjust your filters, or run a Scryfall sync from the admin panel.
            </p>
          </div>
        )}

        {cards.length > 0 && (
          <SearchResults cards={cards} prevUrl={prevUrl} nextUrl={nextUrl} page={page} />
        )}
      </div>
    </div>
  );
}
