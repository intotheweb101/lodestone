'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { DraftableSet } from '@/lib/sealed/packs';

interface Props { sets: DraftableSet[] }

const TYPE_LABELS: Record<string, string> = {
  expansion: 'Expansion', core: 'Core', draft_innovation: 'Draft Innovation',
  masters: 'Masters', funny: 'Un-set',
};

export function SetPicker({ sets }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [packs, setPacks] = useState(6);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function start() {
    if (!selected) return;
    startTransition(() => {
      router.push(`/sealed/${selected}?packs=${packs}`);
    });
  }

  const grouped: Record<string, DraftableSet[]> = {};
  for (const s of sets) {
    const g = s.set_type ?? 'other';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(s);
  }
  const typeOrder = ['expansion', 'core', 'masters', 'draft_innovation', 'funny'];
  const orderedGroups = [
    ...typeOrder.filter(t => grouped[t]),
    ...Object.keys(grouped).filter(t => !typeOrder.includes(t)),
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', padding: '32px 24px', maxWidth: 820, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'var(--text-faintest)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
          Sealed Simulator
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>Build a sealed pool</h1>
        <p style={{ margin: '8px 0 0', color: 'var(--text-faint)', fontSize: 14 }}>
          Pick a set, generate {packs} packs, and build a 40-card deck from your pool.
        </p>
      </div>

      {/* Pack count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Packs:</span>
        {[4, 6, 8].map(n => (
          <button
            key={n}
            onClick={() => setPacks(n)}
            style={{
              padding: '5px 16px', borderRadius: 7, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace",
              background: packs === n ? 'rgba(232,177,74,0.15)' : 'var(--surface)',
              border: `1px solid ${packs === n ? 'var(--accent)' : 'var(--border)'}`,
              color: packs === n ? 'var(--accent)' : 'var(--text-faint)',
            }}
          >{n}</button>
        ))}
        <span style={{ fontSize: 12, color: 'var(--text-faintest)' }}>({packs * 14} cards)</span>
      </div>

      {sets.length === 0 && (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>
          No draftable sets found in the local database. Run a Scryfall sync to populate card data.
        </div>
      )}

      {/* Set grid grouped by type */}
      {orderedGroups.map(type => (
        <div key={type} style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text-faintest)', marginBottom: 10 }}>
            {TYPE_LABELS[type] ?? type}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {grouped[type].map(s => {
              const isSelected = selected === s.code;
              return (
                <button
                  key={s.code}
                  onClick={() => setSelected(isSelected ? null : s.code)}
                  style={{
                    padding: '8px 14px', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                    background: isSelected ? 'rgba(232,177,74,0.1)' : 'var(--surface)',
                    border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                    boxShadow: isSelected ? '0 0 0 1px var(--accent)' : 'none',
                    transition: 'all 0.1s',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--accent)' : 'var(--text)' }}>
                    {s.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-faintest)', fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>
                    {s.code.toUpperCase()} · {(s.commonCount + s.uncommonCount + s.rareCount)} cards
                    {s.released_at ? ` · ${s.released_at.slice(0, 4)}` : ''}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Start button */}
      <div style={{ position: 'sticky', bottom: 0, paddingTop: 16, paddingBottom: 20, background: 'linear-gradient(transparent, var(--bg) 40%)' }}>
        <button
          onClick={start}
          disabled={!selected || isPending}
          style={{
            padding: '13px 32px', borderRadius: 10, fontSize: 15, fontWeight: 700,
            cursor: selected && !isPending ? 'pointer' : 'not-allowed',
            background: selected ? 'var(--accent)' : 'var(--surface-2)',
            border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
            color: selected ? '#0a1f22' : 'var(--text-faintest)',
            transition: 'all 0.15s',
          }}
        >
          {isPending ? 'Generating pool…' : selected ? `Open sealed pool →` : 'Select a set to start'}
        </button>
      </div>
    </div>
  );
}
