import { getDeckBySlug } from '@/lib/deck/store';
import { getDb } from '@/lib/db/connection';
import { getCurrentUser } from '@/lib/auth/session';
import { canView } from '@/lib/auth/access';
import { runMigrations } from '@/lib/db/migrations';
import { mainboardEntries, boardEntries, deckSize } from '@/lib/deck/model';
import type { Deck, DeckEntry, CardCategory } from '@/lib/deck/model';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Compare Decks — Lodestone' };

// ── Types ─────────────────────────────────────────────────────────────────────

interface CardRow {
  oracle_id: string;
  cmc: number | null;
  color_identity_json: string;
}

interface DiffRow {
  key: string;
  card_name: string;
  oracle_id: string | null;
  qtyA: number;
  qtyB: number;
  category: CardCategory | null;
  cmc: number | null;
}

// ── Diff logic ────────────────────────────────────────────────────────────────

function computeDiff(
  deckA: Deck,
  deckB: Deck,
  cardInfo: Map<string, CardRow>,
): DiffRow[] {
  const mainA = mainboardEntries(deckA);
  const mainB = mainboardEntries(deckB);

  const mapA = new Map<string, DeckEntry>();
  for (const e of mainA) mapA.set(e.oracle_id ?? e.card_name, e);

  const mapB = new Map<string, DeckEntry>();
  for (const e of mainB) mapB.set(e.oracle_id ?? e.card_name, e);

  const allKeys = new Set([...mapA.keys(), ...mapB.keys()]);
  const rows: DiffRow[] = [];

  for (const key of allKeys) {
    const ea = mapA.get(key);
    const eb = mapB.get(key);
    const oracle_id = ea?.oracle_id ?? eb?.oracle_id ?? null;
    const info = oracle_id ? cardInfo.get(oracle_id) : null;
    rows.push({
      key,
      card_name: ea?.card_name ?? eb?.card_name ?? key,
      oracle_id,
      qtyA: ea?.quantity ?? 0,
      qtyB: eb?.quantity ?? 0,
      category: ea?.category ?? eb?.category ?? null,
      cmc: info?.cmc ?? null,
    });
  }

  // Sort: only-A first, shared/changed, only-B last; within each group by category then name
  return rows.sort((a, b) => {
    const statusA = a.qtyA > 0 && a.qtyB === 0 ? 0 : a.qtyA > 0 && a.qtyB > 0 ? 1 : 2;
    const statusB = b.qtyA > 0 && b.qtyB === 0 ? 0 : b.qtyA > 0 && b.qtyB > 0 ? 1 : 2;
    if (statusA !== statusB) return statusA - statusB;
    const catCmp = (a.category ?? 'Other').localeCompare(b.category ?? 'Other');
    if (catCmp !== 0) return catCmp;
    return a.card_name.localeCompare(b.card_name);
  });
}

// ── CMC curve (server-side SVG) ───────────────────────────────────────────────

function cmcBuckets(entries: DeckEntry[], cardInfo: Map<string, CardRow>): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0]; // 0, 1, 2, 3, 4, 5, 6+
  for (const e of entries) {
    const info = e.oracle_id ? cardInfo.get(e.oracle_id) : null;
    const cmc = info?.cmc ?? null;
    if (cmc === null) continue;
    const bucket = Math.min(Math.floor(cmc), 6);
    buckets[bucket] += e.quantity;
  }
  return buckets;
}

function CmcChart({ buckets, label, color }: { buckets: number[]; label: string; color: string }) {
  const max = Math.max(...buckets, 1);
  const W = 200, H = 60, barW = 24, gap = 4;
  const total = (barW + gap) * 7 - gap;
  const offsetX = (W - total) / 2;

  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 4 }}>
        {label}
      </div>
      <svg viewBox={`0 0 ${W} ${H + 14}`} width={W} style={{ display: 'block' }}>
        {buckets.map((count, i) => {
          const barH = count === 0 ? 1 : Math.max(3, (count / max) * H);
          const x = offsetX + i * (barW + gap);
          const y = H - barH;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH} fill={color} opacity={0.75} rx={2} />
              {count > 0 && (
                <text x={x + barW / 2} y={y - 2} textAnchor="middle" fontSize={8} fill={color} fontFamily="monospace">
                  {count}
                </text>
              )}
              <text x={x + barW / 2} y={H + 11} textAnchor="middle" fontSize={8} fill="var(--text-faintest)" fontFamily="monospace">
                {i < 6 ? i : '6+'}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Category summary bars ─────────────────────────────────────────────────────

const CATEGORY_ORDER: CardCategory[] = ['Lands', 'Creatures', 'Ramp', 'Card Draw', 'Removal', 'Board Wipes', 'Artifacts', 'Enchantments', 'Instants', 'Sorceries', 'Other'];
const CATEGORY_COLOR: Record<string, string> = {
  Lands: '#6b8e5a', Creatures: '#6a8fbf', Ramp: '#9b7ec8',
  'Card Draw': '#4fa8a8', Removal: '#c26060', 'Board Wipes': '#c27040',
  Artifacts: '#9baab8', Enchantments: '#b07890', Instants: '#70a0d0',
  Sorceries: '#a07090', Other: '#5a7070',
};

function categoryCount(entries: DeckEntry[], cat: CardCategory): number {
  return entries.filter(e => e.category === cat).reduce((s, e) => s + e.quantity, 0);
}

// ── Single-deck picker form ───────────────────────────────────────────────────

function DeckPickerForm({ fixedSlug, fixedLabel }: { fixedSlug?: string; fixedLabel?: string }) {
  return (
    <div style={{ maxWidth: 520, margin: '80px auto', padding: '0 1.5rem', color: 'var(--text)' }}>
      <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--accent)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8 }}>
        Compare Decks
      </p>
      <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 24 }}>
        {fixedSlug ? `Compare with "${fixedLabel}"` : 'Select two decks to compare'}
      </h1>

      <form action="/decks/compare" method="get" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {fixedSlug && <input type="hidden" name="a" value={fixedSlug} />}

        {!fixedSlug && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>Deck A — slug or share URL</span>
            <input name="a" required placeholder="e.g. my-edh-deck" style={{
              background: 'var(--surface)', border: '1.5px solid var(--border)',
              borderRadius: 8, padding: '9px 12px', color: 'var(--text)',
              fontSize: 14, outline: 'none', fontFamily: "'IBM Plex Sans', sans-serif",
            }} />
          </label>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
            {fixedSlug ? 'Deck to compare against — slug or share URL' : 'Deck B — slug or share URL'}
          </span>
          <input name="b" required placeholder="e.g. another-deck" style={{
            background: 'var(--surface)', border: '1.5px solid var(--border)',
            borderRadius: 8, padding: '9px 12px', color: 'var(--text)',
            fontSize: 14, outline: 'none', fontFamily: "'IBM Plex Sans', sans-serif",
          }} />
        </label>

        <button type="submit" style={{
          padding: '10px 0', background: 'var(--accent)', color: '#0a1f22',
          border: 'none', borderRadius: 8, cursor: 'pointer',
          fontWeight: 700, fontSize: 13, fontFamily: "'IBM Plex Sans', sans-serif",
        }}>
          Compare →
        </button>
      </form>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  runMigrations();
  const params = await searchParams;
  const user = await getCurrentUser();

  // Strip full URL to just slug if user pasted a /d/ link
  function extractSlug(raw: string): string {
    return raw.replace(/^.*\/d\//, '').replace(/\?.*$/, '').trim();
  }

  const slugA = params.a ? extractSlug(params.a) : '';
  const slugB = params.b ? extractSlug(params.b) : '';

  if (!slugA) return <DeckPickerForm />;

  const deckA = getDeckBySlug(slugA);
  if (!deckA || !canView(deckA, user)) notFound();

  if (!slugB) {
    return <DeckPickerForm fixedSlug={slugA} fixedLabel={deckA.name} />;
  }

  const deckB = getDeckBySlug(slugB);
  if (!deckB || !canView(deckB, user)) notFound();

  // Fetch card info (CMC + color identity) for all oracle IDs in both decks
  const allOracleIds = [
    ...new Set(
      [...deckA.entries, ...deckB.entries]
        .map(e => e.oracle_id)
        .filter((id): id is string => !!id)
    ),
  ];

  const db = getDb();
  const cardInfo = new Map<string, CardRow>();
  if (allOracleIds.length > 0) {
    const ph = allOracleIds.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT oracle_id, cmc, color_identity_json FROM scryfall_cards WHERE oracle_id IN (${ph}) GROUP BY oracle_id`
    ).all(...allOracleIds) as CardRow[];
    for (const r of rows) cardInfo.set(r.oracle_id, r);
  }

  const diff = computeDiff(deckA, deckB, cardInfo);
  const mainA = mainboardEntries(deckA);
  const mainB = mainboardEntries(deckB);
  const bucketsA = cmcBuckets(mainA, cardInfo);
  const bucketsB = cmcBuckets(mainB, cardInfo);

  const onlyA = diff.filter(r => r.qtyA > 0 && r.qtyB === 0).length;
  const onlyB = diff.filter(r => r.qtyA === 0 && r.qtyB > 0).length;
  const shared = diff.filter(r => r.qtyA > 0 && r.qtyB > 0).length;
  const changed = diff.filter(r => r.qtyA > 0 && r.qtyB > 0 && r.qtyA !== r.qtyB).length;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem', color: 'var(--text)' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', fontSize: 12, color: 'var(--text-faint)', alignItems: 'center' }}>
        <Link href="/decks/browse" style={{ color: 'var(--text-faint)', textDecoration: 'none' }}>Decks</Link>
        <span>/</span>
        <span style={{ color: 'var(--text-muted)' }}>Compare</span>
      </div>

      {/* Deck headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '1rem', alignItems: 'start', marginBottom: '1.5rem' }}>
        <DeckHeader deck={deckA} side="A" />
        <div style={{ display: 'flex', alignItems: 'center', padding: '1.5rem 0', color: 'var(--text-faintest)', fontSize: 20, fontWeight: 300 }}>vs</div>
        <DeckHeader deck={deckB} side="B" />
      </div>

      {/* Summary strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 1, marginBottom: '1.5rem',
        background: 'var(--border)', borderRadius: 10, overflow: 'hidden',
      }}>
        {[
          { label: `Only in A`, value: onlyA, color: '#e2645c' },
          { label: 'Shared', value: shared, color: 'var(--text-muted)' },
          { label: 'Qty changed', value: changed, color: '#e8b14a' },
          { label: `Only in B`, value: onlyB, color: '#54c08a' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: 'var(--surface)', padding: '12px 0', textAlign: 'center',
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Stats row: CMC curves + categories */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        {/* CMC curves */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 12 }}>
            Mana Curve
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <CmcChart buckets={bucketsA} label={deckA.name} color="#54c08a" />
            <CmcChart buckets={bucketsB} label={deckB.name} color="#4a9cc8" />
          </div>
        </div>

        {/* Category breakdown */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 12 }}>
            Categories
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {CATEGORY_ORDER.map(cat => {
              const cA = categoryCount(mainA, cat);
              const cB = categoryCount(mainB, cat);
              if (cA === 0 && cB === 0) return null;
              const maxCat = Math.max(cA, cB, 1);
              const color = CATEGORY_COLOR[cat] ?? 'var(--text-faint)';
              return (
                <div key={cat} style={{ display: 'grid', gridTemplateColumns: '72px 1fr 28px 1fr 28px', gap: 4, alignItems: 'center', fontSize: 10 }}>
                  <span style={{ color: 'var(--text-faint)', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{cat}</span>
                  <div style={{ background: 'var(--surface-2)', borderRadius: 2, height: 6, overflow: 'hidden', direction: 'rtl' }}>
                    <div style={{ width: `${(cA / maxCat) * 100}%`, height: '100%', background: color, opacity: 0.7, borderRadius: 2 }} />
                  </div>
                  <span style={{ color, textAlign: 'center', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>{cA}</span>
                  <div style={{ background: 'var(--surface-2)', borderRadius: 2, height: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${(cB / maxCat) * 100}%`, height: '100%', background: color, opacity: 0.7, borderRadius: 2 }} />
                  </div>
                  <span style={{ color, textAlign: 'center', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>{cB}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Diff table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 52px', padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-faint)' }}>Card</span>
          <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '1px', textTransform: 'uppercase', color: '#54c08a', textAlign: 'center' }}>A</span>
          <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '1px', textTransform: 'uppercase', color: '#4a9cc8', textAlign: 'center' }}>B</span>
        </div>

        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {diff.map((row, i) => {
            const onlyInA = row.qtyA > 0 && row.qtyB === 0;
            const onlyInB = row.qtyA === 0 && row.qtyB > 0;
            const qtyChanged = row.qtyA > 0 && row.qtyB > 0 && row.qtyA !== row.qtyB;
            const bg = onlyInA ? '#e2645c0a' : onlyInB ? '#54c08a0a' : qtyChanged ? '#e8b14a08' : 'transparent';
            const borderColor = onlyInA ? '#e2645c22' : onlyInB ? '#54c08a22' : qtyChanged ? '#e8b14a22' : 'var(--border)';

            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr 52px 52px',
                padding: '5px 16px', borderBottom: `1px solid ${borderColor}`,
                background: bg, alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {row.oracle_id && (
                    <span style={{ fontSize: 9, color: 'var(--text-faintest)', fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0 }}>
                      {row.category?.slice(0, 3).toUpperCase() ?? '   '}
                    </span>
                  )}
                  {row.cmc != null && (
                    <span style={{
                      fontSize: 9, width: 14, height: 14, borderRadius: '50%',
                      background: 'var(--surface-2)', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', flexShrink: 0,
                      color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace",
                    }}>
                      {row.cmc}
                    </span>
                  )}
                  <span style={{
                    fontSize: 12.5, color: 'var(--text)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {row.card_name}
                  </span>
                </div>
                <span style={{ textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: onlyInA ? '#e2645c' : row.qtyA > 0 ? 'var(--text-muted)' : 'var(--text-faintest)' }}>
                  {row.qtyA > 0 ? row.qtyA : '—'}
                </span>
                <span style={{ textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: onlyInB ? '#54c08a' : row.qtyB > 0 ? 'var(--text-muted)' : 'var(--text-faintest)' }}>
                  {row.qtyB > 0 ? row.qtyB : '—'}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', gap: 24, fontSize: 11, color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
          <span>A total: {deckSize(deckA)}</span>
          <span>B total: {deckSize(deckB)}</span>
          <span style={{ marginLeft: 'auto' }}>Mainboard only</span>
        </div>
      </div>

      {/* Swap link */}
      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12 }}>
        <Link href={`/decks/compare?a=${slugB}&b=${slugA}`} style={{ color: 'var(--text-faint)', textDecoration: 'none' }}>
          ⇄ Swap A and B
        </Link>
      </div>
    </div>
  );
}

// ── Deck header card ──────────────────────────────────────────────────────────

function DeckHeader({ deck, side }: { deck: Deck; side: 'A' | 'B' }) {
  const color = side === 'A' ? '#54c08a' : '#4a9cc8';
  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid ${color}33`,
      borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          width: 20, height: 20, borderRadius: '50%', background: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: '#0a1f22', flexShrink: 0,
        }}>{side}</span>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          {deck.public_slug ? (
            <Link href={`/d/${deck.public_slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              {deck.name}
            </Link>
          ) : deck.name}
        </h2>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
        <span>{deck.format ?? 'Unknown format'}</span>
        {deck.commander && <span style={{ color: 'var(--text-muted)' }}>⌘ {deck.commander}</span>}
        <span>{deckSize(deck)} cards</span>
      </div>
    </div>
  );
}
