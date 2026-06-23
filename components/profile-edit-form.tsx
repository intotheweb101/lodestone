'use client';

import { useState } from 'react';
import { actionUpdateProfile } from '@/app/actions';

interface ProfileEditFormProps {
  initialName: string;
  initialBio: string;
  onDone: (newName: string, newBio: string) => void;
  onCancel: () => void;
}

export function ProfileEditForm({ initialName, initialBio, onDone, onCancel }: ProfileEditFormProps) {
  const [name, setName] = useState(initialName);
  const [bio, setBio] = useState(initialBio);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await actionUpdateProfile(name, bio);
      onDone(name, bio);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
      {error && (
        <div style={{ background: 'rgba(226,100,92,0.1)', border: '1px solid rgba(226,100,92,0.3)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#e2645c' }}>
          {error}
        </div>
      )}
      <div>
        <label style={{ display: 'block', fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '5px' }}>
          Display name
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', color: 'var(--text)', fontSize: '14px', outline: 'none', fontFamily: "'IBM Plex Sans', sans-serif", boxSizing: 'border-box' }}
        />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '5px' }}>
          Bio
        </label>
        <textarea
          value={bio}
          onChange={e => setBio(e.target.value)}
          rows={3}
          placeholder="Tell the community about yourself…"
          style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', color: 'var(--text)', fontSize: '14px', outline: 'none', fontFamily: "'IBM Plex Sans', sans-serif", resize: 'vertical', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="submit" disabled={saving}
          style={{ padding: '8px 18px', background: 'var(--accent)', color: '#0a1f22', fontWeight: 700, fontSize: '13px', border: 'none', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: "'IBM Plex Sans', sans-serif" }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={onCancel}
          style={{ padding: '8px 14px', background: 'transparent', color: 'var(--text-muted)', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}
