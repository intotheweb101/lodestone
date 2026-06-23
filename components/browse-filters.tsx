'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { DeckFormat } from '@/lib/deck/model';

const FORMATS: DeckFormat[] = ['commander', 'standard', 'modern', 'pioneer', 'legacy', 'vintage', 'pauper'];
const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;
const MANA_COLORS: Record<string, { bg: string; label: string }> = {
  W: { bg: 'var(--mana-W)', label: 'White' },
  U: { bg: 'var(--mana-U)', label: 'Blue' },
  B: { bg: 'var(--mana-B)', label: 'Black' },
  R: { bg: 'var(--mana-R)', label: 'Red' },
  G: { bg: 'var(--mana-G)', label: 'Green' },
};

export function BrowseFilters({
  currentFormat,
  currentColors,
  currentColorMatch,
  currentSort,
  currentQ,
  currentTag,
}: {
  currentFormat?: string;
  currentColors?: string[];
  currentColorMatch?: string;
  currentSort?: string;
  currentQ?: string;
  currentTag?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function push(updates: Record<string, string | string[] | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page'); // reset to page 1 on filter change
    for (const [k, v] of Object.entries(updates)) {
      params.delete(k);
      if (v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)) {
        if (Array.isArray(v)) v.forEach(x => params.append(k, x));
        else params.set(k, v);
      }
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleColor(c: string) {
    const next = currentColors?.includes(c)
      ? (currentColors ?? []).filter(x => x !== c)
      : [...(currentColors ?? []), c];
    push({ colors: next });
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '7px', color: 'var(--text)', fontSize: '12.5px',
    padding: '5px 10px', outline: 'none', fontFamily: "'IBM Plex Sans', sans-serif",
  };

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
      marginBottom: 20, padding: '12px 14px',
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px',
    }}>
      {/* Text search */}
      <input
        type="search"
        placeholder="Search decks…"
        defaultValue={currentQ ?? ''}
        style={{ ...inputStyle, minWidth: 160 }}
        onKeyDown={e => {
          if (e.key === 'Enter') push({ q: (e.target as HTMLInputElement).value });
        }}
        onBlur={e => push({ q: e.target.value })}
      />

      {/* Format */}
      <select
        value={currentFormat ?? ''}
        onChange={e => push({ format: e.target.value || undefined })}
        style={{ ...inputStyle, cursor: 'pointer' }}
      >
        <option value="">All formats</option>
        {FORMATS.map(f => (
          <option key={f} value={f} style={{ textTransform: 'capitalize' }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </option>
        ))}
      </select>

      {/* Color identity pips */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {WUBRG.map(c => {
          const active = currentColors?.includes(c);
          return (
            <button
              key={c}
              title={MANA_COLORS[c].label}
              onClick={() => toggleColor(c)}
              aria-pressed={!!active}
              style={{
                width: 24, height: 24, borderRadius: '50%',
                background: MANA_COLORS[c].bg,
                border: active ? '2px solid var(--text)' : '2px solid transparent',
                cursor: 'pointer',
                opacity: active ? 1 : 0.45,
                fontWeight: 700, fontSize: 11, color: '#1a1a1a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'opacity 0.12s, border-color 0.12s',
              }}
            >
              {c}
            </button>
          );
        })}
        {(currentColors?.length ?? 0) > 0 && (
          <select
            value={currentColorMatch ?? 'subset'}
            onChange={e => push({ colorMatch: e.target.value })}
            style={{ ...inputStyle, fontSize: '11.5px', padding: '4px 8px' }}
          >
            <option value="subset">Include</option>
            <option value="exact">Exact</option>
            <option value="any">Any</option>
          </select>
        )}
      </div>

      {/* Tag filter */}
      <input
        type="search"
        placeholder="Tag…"
        defaultValue={currentTag ?? ''}
        style={{ ...inputStyle, width: 100 }}
        onKeyDown={e => {
          if (e.key === 'Enter') push({ tag: (e.target as HTMLInputElement).value || undefined });
        }}
        onBlur={e => push({ tag: e.target.value || undefined })}
      />

      {/* Sort */}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        {(['likes', 'recent'] as const).map(s => (
          <button
            key={s}
            onClick={() => push({ sort: s })}
            style={{
              padding: '4px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
              border: '1px solid var(--border)', fontFamily: "'IBM Plex Sans', sans-serif",
              background: (currentSort ?? 'likes') === s ? 'var(--surface-3)' : 'var(--surface)',
              color: (currentSort ?? 'likes') === s ? 'var(--text)' : 'var(--text-faint)',
            }}
          >
            {s === 'likes' ? '❤️ Most liked' : '🕐 Recent'}
          </button>
        ))}
      </div>

      {/* Clear all filters */}
      {(currentQ || currentFormat || (currentColors?.length ?? 0) > 0 || currentTag) && (
        <button
          onClick={() => push({ q: undefined, format: undefined, colors: [], colorMatch: undefined, sort: undefined, tag: undefined })}
          style={{
            fontSize: '11.5px', color: 'var(--text-faint)', background: 'none',
            border: 'none', cursor: 'pointer', padding: '2px 6px',
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
