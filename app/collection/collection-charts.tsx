'use client';

interface CollectionEntry {
  oracle_id: string;
  type_line?: string | null;
  quantity: number;
  foil: boolean;
  price_usd?: number | null;
}

interface Props {
  entries: CollectionEntry[];
}

interface BarData {
  label: string;
  count: number;
  fill: string;
}

function HorizBars({ title, bars }: { title: string; bars: BarData[] }) {
  const max = Math.max(...bars.map(b => b.count), 1);
  const BAR_H = 18;
  const LABEL_W = 88;
  const BAR_MAX_W = 180;
  const GAP = 6;
  const svgH = bars.length * (BAR_H + GAP);

  return (
    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
      <div style={{
        fontSize: '10px',
        fontFamily: "'IBM Plex Mono', monospace",
        letterSpacing: '1.5px',
        textTransform: 'uppercase',
        color: 'var(--text-faint)',
        marginBottom: '10px',
      }}>
        {title}
      </div>
      <svg
        viewBox={`0 0 ${LABEL_W + BAR_MAX_W + 48} ${svgH}`}
        style={{ width: '100%', display: 'block', overflow: 'visible' }}
        aria-hidden
      >
        {bars.map((b, i) => {
          const y = i * (BAR_H + GAP);
          const barW = max > 0 ? Math.round((b.count / max) * BAR_MAX_W) : 0;
          return (
            <g key={b.label}>
              {/* Label */}
              <text
                x={LABEL_W - 6}
                y={y + BAR_H / 2 + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--text-faint)"
                fontFamily="'IBM Plex Mono', monospace"
              >
                {b.label}
              </text>
              {/* Bar bg */}
              <rect
                x={LABEL_W}
                y={y}
                width={BAR_MAX_W}
                height={BAR_H}
                rx="3"
                fill="var(--border)"
              />
              {/* Bar fill */}
              {barW > 0 && (
                <rect
                  x={LABEL_W}
                  y={y}
                  width={barW}
                  height={BAR_H}
                  rx="3"
                  fill={b.fill}
                  opacity="0.85"
                />
              )}
              {/* Count */}
              <text
                x={LABEL_W + BAR_MAX_W + 8}
                y={y + BAR_H / 2 + 4}
                fontSize="11"
                fill="var(--text-faint)"
                fontFamily="'IBM Plex Mono', monospace"
              >
                {b.count.toLocaleString()}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function CollectionCharts({ entries }: Props) {
  if (entries.length === 0) return null;

  // ── Type distribution ──────────────────────────────────────────────────────
  const TYPE_DEFS: { label: string; match: string; fill: string }[] = [
    { label: 'Land',         match: 'Land',         fill: '#8fba78' },
    { label: 'Creature',     match: 'Creature',     fill: '#5fa8d9' },
    { label: 'Instant',      match: 'Instant',      fill: '#7b9bd6' },
    { label: 'Sorcery',      match: 'Sorcery',      fill: '#c07b8a' },
    { label: 'Artifact',     match: 'Artifact',     fill: '#a0b0b4' },
    { label: 'Enchantment',  match: 'Enchantment',  fill: '#c8a94a' },
    { label: 'Planeswalker', match: 'Planeswalker', fill: '#e8b14a' },
    { label: 'Other',        match: '',             fill: '#6a7a7e' },
  ];

  const typeCounts = new Map<string, number>();
  for (const def of TYPE_DEFS) typeCounts.set(def.label, 0);

  for (const e of entries) {
    const tl = e.type_line ?? '';
    let matched = false;
    for (const def of TYPE_DEFS) {
      if (def.match && tl.includes(def.match)) {
        typeCounts.set(def.label, (typeCounts.get(def.label) ?? 0) + e.quantity);
        matched = true;
        break;
      }
    }
    if (!matched) {
      typeCounts.set('Other', (typeCounts.get('Other') ?? 0) + e.quantity);
    }
  }

  const typeBars: BarData[] = TYPE_DEFS
    .map(d => ({ label: d.label, count: typeCounts.get(d.label) ?? 0, fill: d.fill }))
    .filter(b => b.count > 0)
    .sort((a, b) => b.count - a.count);

  // ── Foil vs non-foil ───────────────────────────────────────────────────────
  let foilQty = 0, nonFoilQty = 0;
  for (const e of entries) {
    if (e.foil) foilQty += e.quantity;
    else nonFoilQty += e.quantity;
  }
  const foilBars: BarData[] = [
    { label: 'Non-foil', count: nonFoilQty, fill: '#a0b0b4' },
    { label: 'Foil',     count: foilQty,    fill: '#c8a94a' },
  ].filter(b => b.count > 0);

  // ── Value by type ──────────────────────────────────────────────────────────
  const valueByType = new Map<string, number>();
  for (const e of entries) {
    if (!e.price_usd) continue;
    const tl = e.type_line ?? '';
    let label = 'Other';
    for (const def of TYPE_DEFS) {
      if (def.match && tl.includes(def.match)) { label = def.label; break; }
    }
    valueByType.set(label, (valueByType.get(label) ?? 0) + e.price_usd * e.quantity);
  }
  const valueBars: BarData[] = TYPE_DEFS
    .map(d => ({ label: d.label, count: Math.round(valueByType.get(d.label) ?? 0), fill: d.fill }))
    .filter(b => b.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 7);

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '16px 20px',
      marginBottom: '1.5rem',
    }}>
      <div style={{
        fontSize: '10px',
        fontFamily: "'IBM Plex Mono', monospace",
        letterSpacing: '1.5px',
        textTransform: 'uppercase',
        color: 'var(--text-faint)',
        marginBottom: '16px',
      }}>
        Collection breakdown
      </div>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <HorizBars title="By type" bars={typeBars} />
        {foilBars.length > 1 && <HorizBars title="Foil" bars={foilBars} />}
        {valueBars.length > 0 && <HorizBars title="Value (USD)" bars={valueBars} />}
      </div>
    </div>
  );
}
