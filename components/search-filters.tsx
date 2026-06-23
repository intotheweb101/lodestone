'use client';

import { useRouter } from 'next/navigation';
import { parseQuery, serializeQuery } from '@/lib/search/parser';
import type { SearchTerm, FilterField } from '@/lib/search/parser';

interface Props {
  currentQuery: string;
}

/**
 * Filter chip bar for the search page.
 * Each chip reads / writes a specific field in the query string via
 * parseQuery / serializeQuery — keeping the URL as the single source of truth
 * and letting the server component handle all rendering.
 */
export function SearchFilters({ currentQuery }: Props) {
  const router = useRouter();

  const parsed = parseQuery(currentQuery);

  function getFieldValue(field: FilterField): string {
    return parsed.terms.find(t => t.field === field && !t.negate)?.value ?? '';
  }

  function setField(field: FilterField, value: string, op: SearchTerm['op'] = ':') {
    // Drop all existing non-negated terms for this field, then append new one if non-empty
    const kept = parsed.terms.filter(t => !(t.field === field && !t.negate));
    if (value) kept.push({ field, op, value, negate: false });
    const newQ = serializeQuery({ ...parsed, terms: kept });
    router.push(`/search?q=${encodeURIComponent(newQ)}&page=1`);
  }

  function setOrder(key: 'name' | 'cmc' | 'price') {
    const dir = parsed.order?.key === key && parsed.order.dir === 'asc' ? 'desc' : 'asc';
    router.push(`/search?q=${encodeURIComponent(serializeQuery({ ...parsed, order: { key, dir } }))}&page=1`);
  }

  const TYPE_OPTS = ['', 'creature', 'instant', 'sorcery', 'artifact', 'enchantment', 'planeswalker', 'land'];
  const RARITY_OPTS = ['', 'common', 'uncommon', 'rare', 'mythic'];
  const FORMAT_OPTS = ['', 'commander', 'standard', 'modern', 'pioneer', 'legacy', 'vintage', 'pauper'];
  const COLOR_OPTS: { label: string; value: string }[] = [
    { label: 'Any', value: '' },
    { label: 'W', value: 'W' }, { label: 'U', value: 'U' }, { label: 'B', value: 'B' },
    { label: 'R', value: 'R' }, { label: 'G', value: 'G' },
    { label: 'Colorless', value: 'C' }, { label: 'Multi', value: 'M' },
  ];

  const selectStyle = {
    background: '#0e292b', color: '#9bb3ad', border: '1px solid #214a47',
    borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer',
    fontFamily: "'IBM Plex Sans', sans-serif",
  };

  const orderBtnStyle = (active: boolean) => ({
    padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
    border: `1px solid ${active ? '#e8b14a' : '#214a47'}`,
    background: active ? '#e8b14a22' : '#0e292b',
    color: active ? '#e8b14a' : '#6f8a85',
    fontFamily: "'IBM Plex Mono', monospace",
  });

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, maxWidth: 680, alignItems: 'center' }}>
      {/* Type */}
      <select
        value={getFieldValue('type')}
        onChange={e => setField('type', e.target.value)}
        style={selectStyle}
        aria-label="Filter by type"
      >
        {TYPE_OPTS.map(o => (
          <option key={o} value={o}>{o ? o.charAt(0).toUpperCase() + o.slice(1) : 'Any type'}</option>
        ))}
      </select>

      {/* Colors */}
      <select
        value={getFieldValue('colors')}
        onChange={e => setField('colors', e.target.value)}
        style={selectStyle}
        aria-label="Filter by color"
      >
        {COLOR_OPTS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Rarity */}
      <select
        value={getFieldValue('rarity')}
        onChange={e => setField('rarity', e.target.value)}
        style={selectStyle}
        aria-label="Filter by rarity"
      >
        {RARITY_OPTS.map(o => (
          <option key={o} value={o}>{o ? o.charAt(0).toUpperCase() + o.slice(1) : 'Any rarity'}</option>
        ))}
      </select>

      {/* Format */}
      <select
        value={getFieldValue('format')}
        onChange={e => setField('format', e.target.value)}
        style={selectStyle}
        aria-label="Filter by format legality"
      >
        {FORMAT_OPTS.map(o => (
          <option key={o} value={o}>{o ? o.charAt(0).toUpperCase() + o.slice(1) : 'Any format'}</option>
        ))}
      </select>

      {/* MV max */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 12, color: '#6f8a85' }}>MV≤</span>
        <input
          type="number"
          min={0} max={20}
          value={parsed.terms.find(t => t.field === 'mv' && t.op === '<=' && !t.negate)?.value ?? ''}
          onChange={e => {
            const kept = parsed.terms.filter(t => !(t.field === 'mv' && t.op === '<='));
            if (e.target.value) kept.push({ field: 'mv', op: '<=', value: e.target.value, negate: false });
            router.push(`/search?q=${encodeURIComponent(serializeQuery({ ...parsed, terms: kept }))}&page=1`);
          }}
          placeholder="—"
          style={{ ...selectStyle, width: 44, textAlign: 'center' }}
        />
      </div>

      {/* Divider */}
      <span style={{ color: '#3f5d59', fontSize: 14 }}>|</span>

      {/* Order buttons */}
      <button style={orderBtnStyle(parsed.order?.key === 'name')} onClick={() => setOrder('name')}>Name</button>
      <button style={orderBtnStyle(parsed.order?.key === 'cmc')}  onClick={() => setOrder('cmc')}>CMC</button>
      <button style={orderBtnStyle(parsed.order?.key === 'price')} onClick={() => setOrder('price')}>Price</button>

      {/* Clear all filters */}
      {(parsed.terms.length > 0 || parsed.order) && (
        <button
          onClick={() => router.push('/search')}
          style={{ ...orderBtnStyle(false), color: '#e2645c', borderColor: '#e2645c44' }}
        >
          ✕ Clear
        </button>
      )}
    </div>
  );
}
