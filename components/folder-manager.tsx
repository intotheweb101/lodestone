'use client';

import { useState, useEffect } from 'react';
import { actionListFolders, actionCreateFolder, actionDeleteFolder } from '@/app/actions';
import type { DeckFolder } from '@/lib/deck/store';

export function FolderManager() {
  const [folders, setFolders] = useState<DeckFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    actionListFolders()
      .then(f => setFolders(f as DeckFolder[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setError('');
    try {
      const { id } = await actionCreateFolder(newName.trim());
      setFolders(prev => [...prev, { id, user_id: '', name: newName.trim(), sort: prev.length + 1, created_at: new Date().toISOString() }]);
      setNewName('');
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this folder? Decks inside will not be deleted.')) return;
    try {
      await actionDeleteFolder(id);
      setFolders(prev => prev.filter(f => f.id !== id));
    } catch {
      // ignore
    }
  }

  if (loading) return null;

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          Folders
        </span>
        <button
          onClick={() => { setCreating(true); setError(''); }}
          style={{ fontSize: '11px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', fontFamily: "'IBM Plex Sans', sans-serif" }}
        >
          + New
        </button>
      </div>

      {creating && (
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Folder name…"
            style={{
              flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: '6px', padding: '6px 10px', color: 'var(--text)', fontSize: '12px',
              outline: 'none', fontFamily: "'IBM Plex Sans', sans-serif",
            }}
          />
          <button type="submit" disabled={saving}
            style={{ padding: '6px 12px', background: 'var(--accent)', color: '#0a1f22', fontWeight: 700, fontSize: '12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif" }}>
            {saving ? '…' : 'Save'}
          </button>
          <button type="button" onClick={() => { setCreating(false); setNewName(''); }}
            style={{ padding: '6px 10px', background: 'transparent', color: 'var(--text-muted)', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif" }}>
            ✕
          </button>
        </form>
      )}

      {error && (
        <div style={{ fontSize: '11px', color: '#e2645c', marginBottom: '6px' }}>{error}</div>
      )}

      {folders.length === 0 && !creating ? (
        <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: 0 }}>No folders yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {folders.map(folder => (
            <div key={folder.id} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '7px 10px', background: 'var(--surface-2)',
              border: '1px solid var(--border)', borderRadius: '7px',
            }}>
              <span style={{ fontSize: '13px', flexShrink: 0 }}>📁</span>
              <span style={{ flex: 1, fontSize: '13px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {folder.name}
              </span>
              <button
                onClick={() => handleDelete(folder.id)}
                title="Delete folder"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: '14px', padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
