'use client';
/**
 * API key management panel — create, view, and revoke keys for /api/v1 access.
 * Create shows the raw key ONCE; it's never stored in plaintext.
 */
import { useState, useTransition, useEffect } from 'react';
import { actionCreateApiKey, actionRevokeApiKey, actionListApiKeys } from '@/app/actions';

interface ApiKey {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface ApiKeysPanelProps {
  userId: string;
}

export function ApiKeysPanel({ userId: _userId }: ApiKeysPanelProps) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [label, setLabel] = useState('');
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    actionListApiKeys().then(setKeys).catch(() => {});
  }, []);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    startTransition(async () => {
      try {
        const raw = await actionCreateApiKey(label);
        setNewRawKey(raw);
        setLabel('');
        const updated = await actionListApiKeys();
        setKeys(updated);
      } catch {}
    });
  }

  function handleRevoke(keyId: string) {
    startTransition(async () => {
      await actionRevokeApiKey(keyId);
      const updated = await actionListApiKeys();
      setKeys(updated);
    });
  }

  function handleCopy() {
    if (!newRawKey) return;
    navigator.clipboard.writeText(newRawKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const activeKeys = keys.filter(k => !k.revoked_at);
  const revokedKeys = keys.filter(k => k.revoked_at);

  return (
    <div>
      <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>API Keys</h2>
      <p style={{ fontSize: '13px', color: 'var(--text-faint)', marginBottom: '16px', lineHeight: 1.5 }}>
        Use a key to access the <code style={{ fontFamily: "'IBM Plex Mono',monospace", background: 'var(--surface)', padding: '1px 5px', borderRadius: 4 }}>/api/v1</code> read API at a higher rate limit.
        Pass it as <code style={{ fontFamily: "'IBM Plex Mono',monospace", background: 'var(--surface)', padding: '1px 5px', borderRadius: 4 }}>Authorization: Bearer &lt;key&gt;</code>.
        The raw key is shown only once — store it securely.
      </p>

      {/* New key revealed */}
      {newRawKey && (
        <div style={{
          background: 'rgba(84,192,138,0.08)', border: '1px solid rgba(84,192,138,0.3)',
          borderRadius: 8, padding: '14px 16px', marginBottom: 16,
        }}>
          <div style={{ fontSize: 11, color: '#7fd6a6', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8 }}>
            ✓ Key created — copy it now, it won&apos;t be shown again
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <code style={{
              flex: 1, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12,
              background: 'var(--surface)', padding: '8px 12px', borderRadius: 6,
              border: '1px solid var(--border)', wordBreak: 'break-all', color: 'var(--text)',
            }}>
              {newRawKey}
            </code>
            <button onClick={handleCopy} style={{
              padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)',
              background: copied ? 'rgba(84,192,138,0.12)' : 'var(--surface)',
              color: copied ? '#7fd6a6' : 'var(--text-muted)', cursor: 'pointer',
              fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", whiteSpace: 'nowrap',
            }}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <button onClick={() => setNewRawKey(null)} style={{
              padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer',
              fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif",
            }}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Key label (e.g. My app)"
          value={label}
          onChange={e => setLabel(e.target.value)}
          maxLength={60}
          style={{
            flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 13,
            fontFamily: "'IBM Plex Sans',sans-serif", outline: 'none',
          }}
        />
        <button type="submit" disabled={pending || !label.trim()} style={{
          padding: '9px 18px', borderRadius: 8, background: 'var(--accent)',
          color: '#0a1f22', border: 'none', cursor: pending || !label.trim() ? 'default' : 'pointer',
          fontSize: 13, fontWeight: 700, fontFamily: "'IBM Plex Sans',sans-serif",
          opacity: pending || !label.trim() ? 0.5 : 1,
        }}>
          {pending ? 'Creating…' : 'Create key'}
        </button>
      </form>

      {/* Active keys */}
      {activeKeys.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>No active API keys.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {activeKeys.map(k => (
            <div key={k.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{k.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                  Created {new Date(k.created_at).toLocaleDateString()}
                  {k.last_used_at && ` · Last used ${new Date(k.last_used_at).toLocaleDateString()}`}
                </div>
              </div>
              <button onClick={() => handleRevoke(k.id)} disabled={pending} style={{
                padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(226,100,92,0.4)',
                background: 'rgba(226,100,92,0.08)', color: '#e2645c', cursor: pending ? 'default' : 'pointer',
                fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif",
              }}>
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Revoked keys (collapsed) */}
      {revokedKeys.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 12, color: 'var(--text-faint)', cursor: 'pointer', userSelect: 'none' }}>
            {revokedKeys.length} revoked key{revokedKeys.length !== 1 ? 's' : ''}
          </summary>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {revokedKeys.map(k => (
              <div key={k.id} style={{ fontSize: 12, color: 'var(--text-faint)', padding: '6px 10px', background: 'var(--surface)', borderRadius: 6, opacity: 0.6 }}>
                {k.label} · revoked {k.revoked_at ? new Date(k.revoked_at).toLocaleDateString() : ''}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
