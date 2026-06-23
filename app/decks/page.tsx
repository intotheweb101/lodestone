import { listDecks, getFolders } from '@/lib/deck/store';
import { runMigrations } from '@/lib/db/migrations';
import { resolveActingUser } from '@/lib/auth/session';
import { NewDeckForm } from './new-deck-form';
import { CloneDeckButton } from './clone-deck-button';
import { DeleteDeckButton } from './delete-deck-button';
import { FolderAssign } from './folder-assign';
import { FolderManager } from '@/components/folder-manager';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DecksPage({ searchParams }: { searchParams: Promise<{ folder?: string }> }) {
  runMigrations();
  const { folder: folderFilter } = await searchParams;
  const user = await resolveActingUser();
  const allDecks = user.id === 'local' ? listDecks() : listDecks(user.id);
  const folders = user.id === 'local' ? [] : getFolders(user.id);

  const decks = folderFilter
    ? allDecks.filter(d => d.folder_id === folderFilter)
    : allDecks;

  const activeFolder = folderFilter ? folders.find(f => f.id === folderFilter) : null;

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '11px', color: 'var(--accent)',
            letterSpacing: '2px', textTransform: 'uppercase',
            marginBottom: '6px',
          }}>
            Decks
          </p>
          <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '4px' }}>
            {activeFolder ? `📁 ${activeFolder.name}` : 'My Decks'}
          </h1>
          <p style={{ color: 'var(--text-faint)', fontSize: '12px' }}>
            {decks.length === 0
              ? (folderFilter ? 'No decks in this folder.' : 'No decks yet — create your first below.')
              : `${decks.length} deck${decks.length !== 1 ? 's' : ''}${folderFilter ? '' : ` · ${allDecks.length} total`}`}
          </p>
        </div>
        <Link href="/decks/browse" style={{
          fontSize: 12, color: 'var(--accent)', textDecoration: 'none',
          padding: '6px 14px', border: '1px solid var(--border)',
          borderRadius: 6, background: 'var(--surface)',
        }}>
          Browse public decks →
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '20px', alignItems: 'start' }}>

        {/* Left sidebar: folders + new deck */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Folder filter */}
          {folders.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1rem' }}>
              <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
                Folders
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <Link href="/decks" style={{
                  display: 'block', padding: '6px 8px', borderRadius: '6px', textDecoration: 'none',
                  fontSize: '13px', fontWeight: !folderFilter ? 600 : 400,
                  background: !folderFilter ? 'rgba(232,177,74,0.1)' : 'transparent',
                  color: !folderFilter ? 'var(--accent)' : 'var(--text-faint)',
                }}>
                  All decks ({allDecks.length})
                </Link>
                {folders.map(f => {
                  const count = allDecks.filter(d => d.folder_id === f.id).length;
                  const active = folderFilter === f.id;
                  return (
                    <Link key={f.id} href={`/decks?folder=${f.id}`} style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '6px 8px', borderRadius: '6px', textDecoration: 'none',
                      fontSize: '13px', fontWeight: active ? 600 : 400,
                      background: active ? 'rgba(232,177,74,0.1)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text)',
                    }}>
                      <span>📁</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>{count}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Folder manager (create/delete) */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1rem' }}>
            <FolderManager />
          </div>

          {/* New deck form */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1rem' }}>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '12px' }}>
              New Deck
            </p>
            <NewDeckForm />
          </div>
        </div>

        {/* Deck list */}
        <div>
          {decks.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-faint)', fontSize: '13px' }}>
              {folderFilter ? (
                <>No decks in this folder yet. <Link href="/decks" style={{ color: 'var(--accent)' }}>View all decks</Link> and assign them here.</>
              ) : (
                'Create your first deck using the form.'
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {decks.map(deck => (
                <a key={deck.id} href={`/decks/${deck.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
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
                          <a href={`/d/${deck.public_slug}`} onClick={e => e.stopPropagation()}
                            style={{ fontSize: '11px', color: 'var(--accent)', textDecoration: 'none' }}>
                            Share link ↗
                          </a>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      {folders.length > 0 && (
                        <FolderAssign deckId={deck.id} currentFolderId={deck.folder_id} />
                      )}
                      <CloneDeckButton deckId={deck.id} />
                      <DeleteDeckButton deckId={deck.id} deckName={deck.name} />
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-faint)' }}>
                        <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FormatBadge({ format }: { format: string }) {
  const colors: Record<string, string> = {
    commander: '#e8b14a',
    standard:  '#54c08a',
    modern:    '#a9def9',
    pioneer:   '#c4a8f0',
    legacy:    '#e2645c',
    pauper:    '#a9c0ba',
  };
  const color = colors[format] ?? '#a9c0ba';
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
