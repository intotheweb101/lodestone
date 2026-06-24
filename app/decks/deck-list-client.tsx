'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  actionDeleteDeck,
  actionSetDeckFolder,
  actionSetDeckVisibility,
} from '@/app/actions';
import { FolderAssign } from './folder-assign';
import { CloneDeckButton } from './clone-deck-button';
import { DeleteDeckButton } from './delete-deck-button';
import type { DeckFolder } from '@/lib/deck/store';

interface DeckRow {
  id: string;
  name: string;
  format: string;
  commander: string | null;
  visibility: string;
  public_slug: string | null;
  folder_id: string | null;
  card_count: number;
  like_count: number;
  updated_at: string;
}

interface Props {
  decks: DeckRow[];
  folders: DeckFolder[];
}

const FORMAT_COLORS: Record<string, string> = {
  commander: '#e8b14a',
  standard:  '#54c08a',
  modern:    '#a9def9',
  pioneer:   '#c4a8f0',
  legacy:    '#e2645c',
  pauper:    '#a9c0ba',
};

function FormatBadge({ format }: { format: string }) {
  const color = FORMAT_COLORS[format] ?? '#a9c0ba';
  return (
    <span style={{
      fontSize: '10px', padding: '2px 6px',
      background: `${color}18`, color, borderRadius: '3px',
      border: `1px solid ${color}33`, textTransform: 'capitalize', fontWeight: 600,
      fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.5px',
    }}>
      {format}
    </span>
  );
}

function VisibilityBadge({ visibility }: { visibility: string }) {
  const label = visibility === 'public' ? '🌐 Public' : '🔗 Unlisted';
  return (
    <span style={{
      fontSize: '10px', padding: '2px 6px',
      background: 'var(--surface-2)', color: 'var(--text-faint)',
      borderRadius: 3, border: '1px solid var(--border)',
    }}>
      {label}
    </span>
  );
}

export function DeckListClient({ decks, folders }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkFolder, setBulkFolder] = useState('');
  const [bulkVis, setBulkVis] = useState<string>('');
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const allSelected = decks.length > 0 && selected.size === decks.length;

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(decks.map(d => d.id)));
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkFolder('');
    setBulkVis('');
    setConfirmDelete(false);
  }

  function bulkMoveFolder() {
    if (!bulkFolder && bulkFolder !== '') return;
    startTransition(async () => {
      await Promise.all([...selected].map(id => actionSetDeckFolder(id, bulkFolder || null)));
      clearSelection();
      router.refresh();
    });
  }

  function bulkSetVisibility(vis: 'public' | 'unlisted' | 'private') {
    startTransition(async () => {
      await Promise.all([...selected].map(id => actionSetDeckVisibility(id, vis)));
      clearSelection();
      router.refresh();
    });
  }

  function bulkDelete() {
    startTransition(async () => {
      await Promise.all([...selected].map(id => actionDeleteDeck(id)));
      clearSelection();
      router.refresh();
    });
  }

  const hasSel = selected.size > 0;

  if (decks.length === 0) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-faint)', fontSize: '13px' }}>
        No decks yet — create your first using the form.
      </div>
    );
  }

  return (
    <div>
      {/* Bulk action bar */}
      {hasSel && (
        <div style={{
          position: 'sticky', top: 12, zIndex: 50,
          background: 'var(--surface)', border: '1px solid var(--accent)',
          borderRadius: 'var(--radius-md)', padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)', marginBottom: 10,
        }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>
            {selected.size} selected
          </span>

          {/* Move to folder */}
          {folders.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <select
                value={bulkFolder}
                onChange={e => setBulkFolder(e.target.value)}
                style={{ fontSize: 11, padding: '4px 6px', borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}
              >
                <option value="">📁 No folder</option>
                {folders.map(f => <option key={f.id} value={f.id}>📁 {f.name}</option>)}
              </select>
              <button
                onClick={bulkMoveFolder}
                disabled={isPending}
                style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}
              >
                Move
              </button>
            </div>
          )}

          {/* Set visibility */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['private', 'unlisted', 'public'] as const).map(v => (
              <button
                key={v}
                onClick={() => bulkSetVisibility(v)}
                disabled={isPending}
                style={{
                  fontSize: 10, padding: '4px 8px', borderRadius: 4,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  color: 'var(--text-faint)', cursor: 'pointer', textTransform: 'capitalize',
                }}
              >
                {v === 'public' ? '🌐' : v === 'unlisted' ? '🔗' : '🔒'} {v}
              </button>
            ))}
          </div>

          {/* Delete */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            {confirmDelete ? (
              <>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Delete {selected.size} deck{selected.size !== 1 ? 's' : ''}?</span>
                <button
                  onClick={bulkDelete}
                  disabled={isPending}
                  style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, background: '#e2645c22', border: '1px solid #e2645c55', color: '#e2645c', cursor: 'pointer', fontWeight: 600 }}
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-faint)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, background: 'var(--surface-2)', border: '1px solid var(--border)', color: '#e2645c', cursor: 'pointer' }}
              >
                Delete
              </button>
            )}
            <button
              onClick={clearSelection}
              style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, background: 'transparent', border: 'none', color: 'var(--text-faint)', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Header row with select-all */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 8px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          title="Select all"
          style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0 }}
        />
        <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '1px', textTransform: 'uppercase' }}>
          Select all ({decks.length})
        </span>
      </div>

      {/* Deck rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {decks.map(deck => {
          const isChecked = selected.has(deck.id);
          return (
            <div
              key={deck.id}
              style={{
                background: isChecked ? 'rgba(232,177,74,0.04)' : 'var(--surface)',
                border: `1px solid ${isChecked ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                opacity: isPending && isChecked ? 0.6 : 1,
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(deck.id)}
                style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0 }}
              />

              {/* Main clickable area */}
              <a href={`/decks/${deck.id}`} style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--text)' }}>
                    {deck.name}
                  </span>
                  {deck.commander && (
                    <span style={{ fontSize: '12px', color: 'var(--accent)', fontStyle: 'italic' }}>
                      {deck.commander}
                    </span>
                  )}
                  {deck.visibility !== 'private' && (
                    <VisibilityBadge visibility={deck.visibility} />
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <FormatBadge format={deck.format} />
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'var(--text-faint)' }}>
                    {deck.card_count} cards
                  </span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'var(--text-faint)' }}>
                    {new Date(deck.updated_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}
                  </span>
                  {deck.like_count > 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>❤️ {deck.like_count}</span>
                  )}
                  {deck.public_slug && (
                    <span
                      onClick={e => { e.preventDefault(); window.location.href = `/d/${deck.public_slug}`; }}
                      style={{ fontSize: '11px', color: 'var(--accent)', cursor: 'pointer' }}
                    >
                      Share link ↗
                    </span>
                  )}
                </div>
              </a>

              {/* Per-row actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                {folders.length > 0 && (
                  <FolderAssign deckId={deck.id} currentFolderId={deck.folder_id} />
                )}
                <CloneDeckButton deckId={deck.id} />
                <DeleteDeckButton deckId={deck.id} deckName={deck.name} />
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-faint)' }}>
                  <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
