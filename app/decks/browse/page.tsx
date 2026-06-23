import { listPublicDecksFiltered } from '@/lib/deck/store';
import { runMigrations } from '@/lib/db/migrations';
import { BrowseFilters } from '@/components/browse-filters';
import { Suspense } from 'react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function BrowseDecksPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    format?: string;
    colors?: string | string[];
    colorMatch?: string;
    sort?: string;
    tag?: string;
  }>;
}) {
  const params = await searchParams;
  runMigrations();

  const PAGE_SIZE = 48;
  const page = Math.max(1, parseInt(params.page ?? '1', 10));

  // Normalise multi-value colors param (can be a single string or an array)
  const colorsRaw = params.colors;
  const colors: string[] = colorsRaw
    ? (Array.isArray(colorsRaw) ? colorsRaw : [colorsRaw]).flatMap(s => s.split(''))
    : [];

  const decks = listPublicDecksFiltered(
    {
      q: params.q || undefined,
      format: params.format || undefined,
      colors: colors.length > 0 ? colors : undefined,
      colorMatch: (params.colorMatch as 'exact' | 'subset' | 'any') || 'subset',
      sort: (params.sort as 'likes' | 'recent') || 'likes',
      tag: params.tag || undefined,
    },
    PAGE_SIZE,
    (page - 1) * PAGE_SIZE,
  );

  // Build pagination URL helper that preserves filters
  function pageLink(p: number): string {
    const sp = new URLSearchParams();
    if (params.q) sp.set('q', params.q);
    if (params.format) sp.set('format', params.format);
    colors.forEach(c => sp.append('colors', c));
    if (params.colorMatch) sp.set('colorMatch', params.colorMatch);
    if (params.sort) sp.set('sort', params.sort);
    if (params.tag) sp.set('tag', params.tag);
    sp.set('page', String(p));
    return `/decks/browse?${sp.toString()}`;
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px', color: 'var(--text)' }}>
      <div style={{ marginBottom: 20 }}>
        <p style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11, color: 'var(--accent)',
          letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6,
        }}>
          Community
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
          Browse Public Decks
        </h1>
        <p style={{ color: 'var(--text-faint)', fontSize: 12 }}>
          Decks shared by the community.
        </p>
      </div>

      {/* Filters — wrapped in Suspense because BrowseFilters uses useSearchParams */}
      <Suspense>
        <BrowseFilters
          currentQ={params.q}
          currentFormat={params.format}
          currentColors={colors}
          currentColorMatch={params.colorMatch}
          currentSort={params.sort}
          currentTag={params.tag}
        />
      </Suspense>

      {decks.length === 0 ? (
        <p style={{ color: 'var(--text-faint)', fontSize: 14, padding: '32px 0' }}>
          No public decks match your filters.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
          {decks.map(d => (
            <Link
              key={d.id}
              href={d.public_slug ? `/d/${d.public_slug}` : `/decks/${d.id}`}
              style={{ textDecoration: 'none', color: 'var(--text)' }}
            >
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)', padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{d.name}</span>
                    {d.commander && (
                      <span style={{ fontSize: 12, color: 'var(--accent)', fontStyle: 'italic' }}>
                        {d.commander}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-faint)', flexWrap: 'wrap' }}>
                    <span style={{ textTransform: 'capitalize' }}>{d.format}</span>
                    <span>{d.card_count} cards</span>
                    <span>{new Date(d.updated_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}</span>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-faint)', flexShrink: 0 }}>
                  ❤️ {d.like_count}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {page > 1 && (
          <Link href={pageLink(page - 1)} style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}>
            ← Previous
          </Link>
        )}
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Page {page}</span>
        {decks.length === PAGE_SIZE && (
          <Link href={pageLink(page + 1)} style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}>
            Next →
          </Link>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <Link href="/decks" style={{ fontSize: 13, color: 'var(--text-faint)' }}>← My decks</Link>
      </div>
    </div>
  );
}
