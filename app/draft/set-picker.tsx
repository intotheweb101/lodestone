'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DraftableSet } from '@/lib/sealed/packs';

interface Props {
  sets: DraftableSet[];
}

const TYPE_ORDER = ['expansion', 'core', 'masters', 'draft_innovation', 'funny'];
const TYPE_LABELS: Record<string, string> = {
  expansion: 'Expansion',
  core: 'Core Set',
  masters: 'Masters',
  draft_innovation: 'Draft Innovation',
  funny: 'Un-set',
};

export function DraftSetPicker({ sets }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const router = useRouter();

  const byType = new Map<string, DraftableSet[]>();
  for (const s of sets) {
    const t = s.set_type ?? 'other';
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(s);
  }

  const order = [...TYPE_ORDER, ...Array.from(byType.keys()).filter(k => !TYPE_ORDER.includes(k))];

  function start() {
    if (!selected) return;
    router.push(`/draft/${selected.toLowerCase()}`);
  }

  const s = { fontFamily: "'IBM Plex Mono', monospace" } as const;

  return (
    <div>
      {sets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', color: 'var(--text-faint)', fontSize: '13px' }}>
          No sets with enough cards found. Run a Scryfall sync first.
        </div>
      ) : (
        <>
          {order.filter(t => byType.has(t)).map(type => (
            <div key={type} style={{ marginBottom: '1.5rem' }}>
              <div style={{ ...s, fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: '8px' }}>
                {TYPE_LABELS[type] ?? type}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                {byType.get(type)!.map(set => (
                  <button
                    key={set.code}
                    onClick={() => setSelected(set.code)}
                    style={{
                      padding: '10px 14px', borderRadius: '9px', textAlign: 'left',
                      cursor: 'pointer', transition: 'all 0.12s',
                      background: selected === set.code ? 'rgba(232,177,74,0.1)' : 'var(--surface)',
                      border: `1px solid ${selected === set.code ? 'var(--accent)' : 'var(--border)'}`,
                      fontFamily: "'IBM Plex Sans', sans-serif",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '13px', color: selected === set.code ? 'var(--accent)' : 'var(--text)', marginBottom: '2px' }}>
                      {set.name}
                    </div>
                    <div style={{ ...s, fontSize: '10px', color: 'var(--text-faint)' }}>
                      {set.code.toUpperCase()} · {set.commonCount}C {set.uncommonCount}U {set.rareCount}R
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '1.5rem', padding: '16px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text-faint)', fontSize: '12px', flex: 1 }}>
              {selected ? `3 packs × ~15 cards from ${selected.toUpperCase()}` : 'Select a set to start'}
            </div>
            <button
              onClick={start}
              disabled={!selected}
              style={{
                padding: '9px 22px', borderRadius: '9px', fontWeight: 700, fontSize: '13px',
                cursor: selected ? 'pointer' : 'not-allowed',
                background: selected ? 'var(--accent)' : 'var(--surface)',
                border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                color: selected ? '#0a1f22' : 'var(--text-faint)',
                fontFamily: "'IBM Plex Sans', sans-serif",
                transition: 'all 0.12s',
              }}
            >
              Start Draft →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
