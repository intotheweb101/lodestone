'use client';

import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { parseQuery, serializeQuery } from '@/lib/search/parser';
import type { SearchTerm, FilterField, CompareOp } from '@/lib/search/parser';

interface Props {
  currentQuery: string;
}

// ── Label map for active chips ────────────────────────────────────────────────

const CHIP_KEY: Partial<Record<FilterField, string>> = {
  name: '', type: 't', oracle: 'o', colors: 'c', identity: 'id',
  mv: 'mv', pow: 'pow', tou: 'tou', loy: 'loy',
  rarity: 'r', format: 'f', set: 's', is: 'is', keyword: 'kw',
  price_usd: 'usd', price_eur: 'eur',
  artist: 'art', flavor: 'ft', year: 'year',
  banned: 'banned', restricted: 'restricted',
  cn: 'cn', border: 'border', frame: 'frame',
};

function termLabel(t: SearchTerm): string {
  const prefix = t.negate ? '−' : '';
  const key = CHIP_KEY[t.field] ?? t.field;
  if (t.field === 'name') return `${prefix}${t.value}`;
  const op = t.op === ':' ? ':' : t.op;
  return `${prefix}${key}${op}${t.value}`;
}

// ── Main component ────────────────────────────────────────────────────────────

export function SearchFilters({ currentQuery }: Props) {
  const router = useRouter();
  const parsed = parseQuery(currentQuery);

  function navigate(terms: SearchTerm[], order = parsed.order) {
    const q = serializeQuery({ ...parsed, terms, order });
    router.push(`/search?q=${encodeURIComponent(q)}&page=1`);
  }

  // Get the value of a term matching field + optional op
  function val(field: FilterField, op?: CompareOp): string {
    return parsed.terms.find(t =>
      t.field === field && !t.negate && (op == null || t.op === op)
    )?.value ?? '';
  }

  // Replace all non-negated terms for a field+op with the given value
  function set(field: FilterField, value: string, op: CompareOp = ':') {
    const kept = parsed.terms.filter(t => !(t.field === field && t.op === op && !t.negate));
    if (value) kept.push({ field, op, value: value.toLowerCase(), negate: false });
    navigate(kept);
  }

  // Remove term at index
  function remove(idx: number) {
    navigate(parsed.terms.filter((_, i) => i !== idx));
  }

  // Toggle an is: flag on/off
  function toggleIs(value: string) {
    const idx = parsed.terms.findIndex(t => t.field === 'is' && t.value === value && !t.negate);
    const kept = idx >= 0
      ? parsed.terms.filter((_, i) => i !== idx)
      : [...parsed.terms, { field: 'is' as FilterField, op: ':' as CompareOp, value, negate: false }];
    navigate(kept);
  }

  // Toggle sort key; clicking same key flips direction
  function setOrder(key: 'name' | 'cmc' | 'price' | 'released') {
    const sameKey = parsed.order?.key === key;
    const dir = sameKey && parsed.order?.dir === 'asc' ? 'desc' : 'asc';
    navigate(parsed.terms, { key, dir });
  }

  const hasAny = parsed.terms.length > 0 || !!parsed.order;
  const isActive = (field: FilterField, value: string) =>
    parsed.terms.some(t => t.field === field && t.value === value && !t.negate);

  // ── Static option lists ──────────────────────────────────────────────────

  const TYPE_OPTS = ['', 'creature', 'instant', 'sorcery', 'artifact', 'enchantment', 'planeswalker', 'battle', 'land', 'tribal'];
  const RARITY_OPTS = ['', 'common', 'uncommon', 'rare', 'mythic'];
  const FORMAT_OPTS = ['', 'commander', 'standard', 'modern', 'pioneer', 'legacy', 'vintage', 'pauper', 'oathbreaker'];
  const BORDER_OPTS = ['', 'black', 'white', 'silver', 'gold', 'borderless'];
  const FRAME_OPTS  = ['', 'showcase', 'extendedart', 'retro', 'etched'];
  const COLOR_OPTS  = [
    { label: 'Any', value: '' },
    { label: 'W', value: 'W' }, { label: 'U', value: 'U' }, { label: 'B', value: 'B' },
    { label: 'R', value: 'R' }, { label: 'G', value: 'G' },
    { label: 'Colorless', value: 'C' }, { label: 'Multicolor', value: 'M' },
  ];
  const IS_FLAGS = [
    { value: 'foil',        label: 'Foil' },
    { value: 'nonfoil',     label: 'Non-foil' },
    { value: 'fullart',     label: 'Full art' },
    { value: 'promo',       label: 'Promo' },
    { value: 'showcase',    label: 'Showcase' },
    { value: 'extendedart', label: 'Ext. art' },
    { value: 'borderless',  label: 'Borderless' },
    { value: 'commander',   label: 'Commander' },
    { value: 'land',        label: 'Land' },
    { value: 'spell',       label: 'Spell' },
    { value: 'textless',    label: 'Textless' },
  ];

  // ── Shared style tokens ───────────────────────────────────────────────────

  const sel: CSSProperties = {
    background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '5px 8px', fontSize: 12, cursor: 'pointer',
    fontFamily: "'IBM Plex Sans', sans-serif",
  };
  const inp: CSSProperties = { ...sel, outline: 'none' };
  const mono11: CSSProperties = {
    fontSize: 11, color: 'var(--text-faint)',
    fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.4px',
    whiteSpace: 'nowrap',
  };
  const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 };
  const grp: CSSProperties = { display: 'flex', alignItems: 'center', gap: 4 };

  function sortBtn(key: string): CSSProperties {
    const active = parsed.order?.key === key;
    return {
      padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      background: active ? 'var(--accent-glow)' : 'var(--surface)',
      color: active ? 'var(--accent)' : 'var(--text-faint)',
      fontFamily: "'IBM Plex Mono', monospace",
    };
  }

  function flagBtn(value: string): CSSProperties {
    const active = isActive('is', value);
    return {
      padding: '3px 9px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      background: active ? 'var(--accent-glow)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--text-faint)',
      fontFamily: "'IBM Plex Sans', sans-serif",
      transition: 'all 0.1s ease',
    };
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>

      {/* Active filter chips */}
      {parsed.terms.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {parsed.terms.map((term, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '2px 7px 2px 9px', borderRadius: 10,
              background: term.negate ? '#e2645c18' : 'var(--accent-glow)',
              border: `1px solid ${term.negate ? '#e2645c55' : 'var(--accent)55'}`,
              color: term.negate ? '#e2645c' : 'var(--accent)',
              fontSize: 11, fontFamily: "'IBM Plex Mono', monospace",
            }}>
              {termLabel(term)}
              <button
                onClick={() => remove(i)}
                aria-label={`Remove ${termLabel(term)}`}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '0 2px', lineHeight: 1, color: 'inherit', opacity: 0.65,
                  fontSize: 13,
                }}
              >×</button>
            </span>
          ))}
        </div>
      )}

      {/* Row 1: Core filters */}
      <div style={row}>
        {/* Type */}
        <select value={val('type')} onChange={e => set('type', e.target.value)} style={sel} aria-label="Filter by type">
          {TYPE_OPTS.map(o => <option key={o} value={o}>{o ? o.charAt(0).toUpperCase() + o.slice(1) : 'Any type'}</option>)}
        </select>

        {/* Colors */}
        <select value={val('colors')} onChange={e => set('colors', e.target.value)} style={sel} aria-label="Filter by color">
          {COLOR_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Rarity */}
        <select value={val('rarity')} onChange={e => set('rarity', e.target.value)} style={sel} aria-label="Filter by rarity">
          {RARITY_OPTS.map(o => <option key={o} value={o}>{o ? o.charAt(0).toUpperCase() + o.slice(1) : 'Any rarity'}</option>)}
        </select>

        {/* Format */}
        <select value={val('format')} onChange={e => set('format', e.target.value)} style={sel} aria-label="Legal in format">
          {FORMAT_OPTS.map(o => <option key={o} value={o}>{o ? o.charAt(0).toUpperCase() + o.slice(1) : 'Legal in…'}</option>)}
        </select>

        {/* CMV ≤ */}
        <div style={grp}>
          <span style={mono11}>CMV≤</span>
          <input
            type="number" min={0} max={20}
            value={val('mv', '<=')}
            onChange={e => {
              const kept = parsed.terms.filter(t => !(t.field === 'mv' && t.op === '<='));
              if (e.target.value) kept.push({ field: 'mv', op: '<=', value: e.target.value, negate: false });
              navigate(kept);
            }}
            placeholder="—"
            style={{ ...inp, width: 44, textAlign: 'center' }}
            aria-label="Max mana value"
          />
        </div>

        {/* Set code */}
        <div style={grp}>
          <span style={mono11}>Set</span>
          <input
            type="text"
            value={val('set')}
            onChange={e => set('set', e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
            placeholder="e.g. mh3"
            maxLength={8}
            style={{ ...inp, width: 60 }}
            aria-label="Set code"
          />
        </div>

        <span style={{ color: 'var(--border)', fontSize: 16, margin: '0 2px' }}>|</span>

        {/* Sort buttons */}
        <button style={sortBtn('name')} onClick={() => setOrder('name')}>Name</button>
        <button style={sortBtn('cmc')}  onClick={() => setOrder('cmc')}>CMC</button>
        <button style={sortBtn('price')} onClick={() => setOrder('price')}>Price</button>
        <button style={sortBtn('released')} onClick={() => setOrder('released')}>Date</button>

        {/* Dir toggle */}
        {parsed.order && (
          <button
            onClick={() => {
              const newDir = parsed.order!.dir === 'asc' ? 'desc' : 'asc';
              navigate(parsed.terms, { ...parsed.order!, dir: newDir });
            }}
            style={{ ...sortBtn(parsed.order.key), padding: '4px 8px' }}
            aria-label={`Direction: ${parsed.order.dir}`}
          >
            {parsed.order.dir === 'asc' ? '↑' : '↓'}
          </button>
        )}

        {/* Clear all */}
        {hasAny && (
          <button
            onClick={() => router.push('/search')}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
              border: '1px solid #e2645c44', background: 'transparent',
              color: '#e2645c', fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* Row 2: Detail filters */}
      <div style={row}>
        {/* Artist */}
        <div style={grp}>
          <span style={mono11}>Artist</span>
          <input
            type="text"
            value={val('artist')}
            onChange={e => set('artist', e.target.value)}
            placeholder="any artist"
            style={{ ...inp, width: 128 }}
            aria-label="Artist name"
          />
        </div>

        {/* Flavor text */}
        <div style={grp}>
          <span style={mono11}>Flavor</span>
          <input
            type="text"
            value={val('flavor')}
            onChange={e => set('flavor', e.target.value)}
            placeholder="any flavor text"
            style={{ ...inp, width: 128 }}
            aria-label="Flavor text contains"
          />
        </div>

        {/* USD range */}
        <div style={grp}>
          <span style={mono11}>USD</span>
          <input
            type="number" min={0} step={0.01}
            value={val('price_usd', '>=')}
            onChange={e => {
              const kept = parsed.terms.filter(t => !(t.field === 'price_usd' && t.op === '>='));
              if (e.target.value) kept.push({ field: 'price_usd', op: '>=', value: e.target.value, negate: false });
              navigate(kept);
            }}
            placeholder="min"
            style={{ ...inp, width: 60 }}
            aria-label="Min USD price"
          />
          <span style={{ ...mono11, opacity: 0.6 }}>–</span>
          <input
            type="number" min={0} step={0.01}
            value={val('price_usd', '<=')}
            onChange={e => {
              const kept = parsed.terms.filter(t => !(t.field === 'price_usd' && t.op === '<='));
              if (e.target.value) kept.push({ field: 'price_usd', op: '<=', value: e.target.value, negate: false });
              navigate(kept);
            }}
            placeholder="max"
            style={{ ...inp, width: 60 }}
            aria-label="Max USD price"
          />
        </div>

        {/* Year range */}
        <div style={grp}>
          <span style={mono11}>Year</span>
          <input
            type="number" min={1993} max={2035}
            value={val('year', '>=')}
            onChange={e => {
              const kept = parsed.terms.filter(t => !(t.field === 'year' && t.op === '>='));
              if (e.target.value) kept.push({ field: 'year', op: '>=', value: e.target.value, negate: false });
              navigate(kept);
            }}
            placeholder="from"
            style={{ ...inp, width: 68 }}
            aria-label="Year from"
          />
          <span style={{ ...mono11, opacity: 0.6 }}>–</span>
          <input
            type="number" min={1993} max={2035}
            value={val('year', '<=')}
            onChange={e => {
              const kept = parsed.terms.filter(t => !(t.field === 'year' && t.op === '<='));
              if (e.target.value) kept.push({ field: 'year', op: '<=', value: e.target.value, negate: false });
              navigate(kept);
            }}
            placeholder="to"
            style={{ ...inp, width: 68 }}
            aria-label="Year to"
          />
        </div>

        {/* Border */}
        <div style={grp}>
          <span style={mono11}>Border</span>
          <select value={val('border')} onChange={e => set('border', e.target.value)} style={sel} aria-label="Border color">
            {BORDER_OPTS.map(o => <option key={o} value={o}>{o ? o.charAt(0).toUpperCase() + o.slice(1) : 'Any'}</option>)}
          </select>
        </div>

        {/* Frame */}
        <div style={grp}>
          <span style={mono11}>Frame</span>
          <select value={val('frame')} onChange={e => set('frame', e.target.value)} style={sel} aria-label="Frame effect">
            {FRAME_OPTS.map(o => <option key={o} value={o}>{o ? o.charAt(0).toUpperCase() + o.slice(1) : 'Any'}</option>)}
          </select>
        </div>

        {/* Banned in */}
        <div style={grp}>
          <span style={mono11}>Banned</span>
          <select value={val('banned')} onChange={e => set('banned', e.target.value)} style={sel} aria-label="Banned in format">
            {FORMAT_OPTS.map(o => <option key={o} value={o}>{o ? o.charAt(0).toUpperCase() + o.slice(1) : '—'}</option>)}
          </select>
        </div>

        {/* Restricted in */}
        <div style={grp}>
          <span style={mono11}>Restricted</span>
          <select value={val('restricted')} onChange={e => set('restricted', e.target.value)} style={sel} aria-label="Restricted in format">
            {FORMAT_OPTS.map(o => <option key={o} value={o}>{o ? o.charAt(0).toUpperCase() + o.slice(1) : '—'}</option>)}
          </select>
        </div>
      </div>

      {/* Row 3: is: flag pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5 }}>
        <span style={{ ...mono11, marginRight: 2 }}>is:</span>
        {IS_FLAGS.map(f => (
          <button key={f.value} style={flagBtn(f.value)} onClick={() => toggleIs(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

    </div>
  );
}
