'use client';

import { useState } from 'react';
import { Btn } from '@/components/ui';
import type { CardPackage, PackageEntry } from '@/lib/packages/store';
import {
  actionCreatePackage, actionDeletePackage, actionUpdatePackageMeta,
  actionRemoveEntryFromPackage,
} from '@/app/actions';

interface PackageWithEntries extends CardPackage {
  entries: PackageEntry[];
}

export function PackagesClient({ initialPackages }: { initialPackages: PackageWithEntries[] }) {
  const [packages, setPackages] = useState(initialPackages);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const pkg = await actionCreatePackage(newName.trim(), newDesc.trim() || undefined);
      setPackages(prev => [{ ...pkg, entries: [] }, ...prev]);
      setNewName(''); setNewDesc('');
    } finally { setCreating(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this package?')) return;
    await actionDeletePackage(id);
    setPackages(prev => prev.filter(p => p.id !== id));
  }

  async function handleRemoveEntry(packageId: string, entryId: string) {
    await actionRemoveEntryFromPackage(entryId, packageId);
    setPackages(prev => prev.map(p =>
      p.id === packageId ? { ...p, entries: p.entries.filter(e => e.id !== entryId) } : p
    ));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Create */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>New package</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Package name (e.g. Ramp Suite)"
            style={{ flex: 2, minWidth: 160, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13 }}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          />
          <input
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            style={{ flex: 3, minWidth: 160, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13 }}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          />
          <Btn onClick={handleCreate} disabled={creating || !newName.trim()}>
            {creating ? 'Creating…' : '+ Create'}
          </Btn>
        </div>
      </div>

      {/* List */}
      {packages.length === 0 ? (
        <p style={{ color: 'var(--text-faint)', fontSize: 13, padding: '20px 0' }}>
          No packages yet. Create one above, then add cards to it from the deck builder.
        </p>
      ) : (
        packages.map(pkg => (
          <div key={pkg.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{pkg.name}</div>
                {pkg.description && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{pkg.description}</div>}
                <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace", marginTop: 4 }}>
                  {pkg.entries.length} card{pkg.entries.length !== 1 ? 's' : ''}
                </div>
              </div>
              <button
                onClick={() => handleDelete(pkg.id)}
                style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'rgba(226,100,92,0.1)', border: '1px solid rgba(226,100,92,0.3)', color: '#e2645c', cursor: 'pointer' }}
              >
                Delete
              </button>
            </div>

            {pkg.entries.length > 0 && (
              <div style={{ padding: '8px 16px' }}>
                {pkg.entries.map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, minWidth: 24, textAlign: 'right' }}>
                      {e.quantity}×
                    </span>
                    <span style={{ flex: 1 }}>{e.card_name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>{e.board}</span>
                    <button
                      onClick={() => handleRemoveEntry(pkg.id, e.id)}
                      style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'none', border: '1px solid var(--border)', color: 'var(--text-faint)', cursor: 'pointer' }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ padding: '8px 16px', borderTop: pkg.entries.length > 0 ? '1px solid var(--border)' : 'none', fontSize: 11, color: 'var(--text-faint)' }}>
              💡 To add cards: go to a deck builder, search for a card, and use the card menu → "Add to package"
            </div>
          </div>
        ))
      )}
    </div>
  );
}
