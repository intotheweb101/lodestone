'use client';

import { useState, useEffect } from 'react';
import { actionSetDeckFolder, actionListFolders } from '@/app/actions';
import type { DeckFolder } from '@/lib/deck/store';

export function FolderAssign({ deckId, currentFolderId }: { deckId: string; currentFolderId: string | null }) {
  const [folders, setFolders] = useState<DeckFolder[]>([]);
  const [value, setValue] = useState(currentFolderId ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    actionListFolders()
      .then(f => setFolders(f as DeckFolder[]))
      .catch(() => {});
  }, []);

  if (folders.length === 0) return null;

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const folderId = e.target.value || null;
    setValue(e.target.value);
    setSaving(true);
    try {
      await actionSetDeckFolder(deckId, folderId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={saving}
      onClick={e => e.stopPropagation()}
      title="Move to folder"
      style={{
        fontSize: '11px',
        padding: '4px 6px',
        borderRadius: '6px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        color: value ? 'var(--accent)' : 'var(--text-faint)',
        cursor: 'pointer',
        fontFamily: "'IBM Plex Sans', sans-serif",
        maxWidth: '120px',
      }}
    >
      <option value="">📁 No folder</option>
      {folders.map(f => (
        <option key={f.id} value={f.id}>📁 {f.name}</option>
      ))}
    </select>
  );
}
