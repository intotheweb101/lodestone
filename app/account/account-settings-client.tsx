'use client';

import { useState } from 'react';
import {
  actionUpdateProfile,
  actionUpdateEmail,
  actionChangePassword,
  actionDeleteAccount,
} from '@/app/actions';

interface Props {
  id: string;
  name: string;
  email: string;
  username: string;
  bio: string;
  hasPassword: boolean;
  isGoogleLinked: boolean;
  role: string;
}

const INPUT: React.CSSProperties = {
  width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: '8px', padding: '9px 12px', color: 'var(--text)', fontSize: '14px',
  outline: 'none', fontFamily: "'IBM Plex Sans', sans-serif", boxSizing: 'border-box',
};
const LABEL: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace",
  color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '5px',
};
const SECTION: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: '12px', padding: '20px 24px', marginBottom: '16px',
};
const SECTION_TITLE: React.CSSProperties = {
  fontSize: '13px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px',
  paddingBottom: '12px', borderBottom: '1px solid var(--border)',
};

function SaveBtn({ saving, label = 'Save changes' }: { saving: boolean; label?: string }) {
  return (
    <button type="submit" disabled={saving} style={{
      padding: '8px 20px', background: 'var(--accent)', color: '#0a1f22',
      fontWeight: 700, fontSize: '13px', border: 'none', borderRadius: '8px',
      cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
      fontFamily: "'IBM Plex Sans', sans-serif",
    }}>
      {saving ? 'Saving…' : label}
    </button>
  );
}

function SuccessBanner({ msg }: { msg: string }) {
  return (
    <div style={{ background: 'rgba(84,192,138,0.1)', border: '1px solid rgba(84,192,138,0.3)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#54c08a', marginBottom: '12px' }}>
      ✓ {msg}
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div style={{ background: 'rgba(226,100,92,0.1)', border: '1px solid rgba(226,100,92,0.3)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#e2645c', marginBottom: '12px' }}>
      {msg}
    </div>
  );
}

export function AccountSettingsClient({ name: initName, email: initEmail, username: initUsername, bio: initBio, hasPassword, isGoogleLinked, role }: Props) {
  // ── Profile section ──────────────────────────────────────────────────────────
  const [name, setName] = useState(initName);
  const [username, setUsername] = useState(initUsername);
  const [bio, setBio] = useState(initBio);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');

  async function handleProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(''); setProfileErr('');
    setProfileSaving(true);
    try {
      await actionUpdateProfile(name, bio, username);
      setProfileMsg('Profile updated.');
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : 'Failed to save.');
    } finally { setProfileSaving(false); }
  }

  // ── Email section ────────────────────────────────────────────────────────────
  const [email, setEmail] = useState(initEmail);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');
  const [emailErr, setEmailErr] = useState('');

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailMsg(''); setEmailErr('');
    setEmailSaving(true);
    try {
      await actionUpdateEmail(email);
      setEmailMsg('Email updated.');
    } catch (err) {
      setEmailErr(err instanceof Error ? err.message : 'Failed to update email.');
    } finally { setEmailSaving(false); }
  }

  // ── Password section ─────────────────────────────────────────────────────────
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdErr, setPwdErr] = useState('');

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdMsg(''); setPwdErr('');
    if (newPwd !== confirmPwd) { setPwdErr('New passwords do not match.'); return; }
    setPwdSaving(true);
    try {
      await actionChangePassword(currentPwd, newPwd);
      setPwdMsg('Password changed.');
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err) {
      setPwdErr(err instanceof Error ? err.message : 'Failed to change password.');
    } finally { setPwdSaving(false); }
  }

  // ── Delete account ───────────────────────────────────────────────────────────
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm('Permanently delete your account? All your decks, collection, and data will be erased. This cannot be undone.')) return;
    setDeleting(true);
    try { await actionDeleteAccount(); } finally { setDeleting(false); }
  }

  return (
    <div>
      {/* Profile */}
      <div style={SECTION}>
        <div style={SECTION_TITLE}>Profile</div>
        {profileMsg && <SuccessBanner msg={profileMsg} />}
        {profileErr && <ErrorBanner msg={profileErr} />}
        <form onSubmit={handleProfile} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={LABEL}>Display name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Username</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', fontSize: '14px', pointerEvents: 'none' }}>@</span>
              <input type="text" value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} style={{ ...INPUT, paddingLeft: '26px' }} />
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-faint)' }}>
              Your public profile URL: /u/{username || '…'}
            </p>
          </div>
          <div>
            <label style={LABEL}>Bio</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3}
              placeholder="Tell the community about yourself…"
              style={{ ...INPUT, resize: 'vertical' }} />
          </div>
          <div><SaveBtn saving={profileSaving} /></div>
        </form>
      </div>

      {/* Email */}
      <div style={SECTION}>
        <div style={SECTION_TITLE}>Email address</div>
        {isGoogleLinked && (
          <p style={{ fontSize: '12px', color: 'var(--text-faint)', marginBottom: '12px' }}>
            Your account is linked to Google. Changing your email here only affects password sign-in.
          </p>
        )}
        {emailMsg && <SuccessBanner msg={emailMsg} />}
        {emailErr && <ErrorBanner msg={emailErr} />}
        <form onSubmit={handleEmail} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={LABEL}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={INPUT} />
          </div>
          <SaveBtn saving={emailSaving} label="Update" />
        </form>
      </div>

      {/* Password — only for accounts with a password hash */}
      {hasPassword && (
        <div style={SECTION}>
          <div style={SECTION_TITLE}>Change password</div>
          {pwdMsg && <SuccessBanner msg={pwdMsg} />}
          {pwdErr && <ErrorBanner msg={pwdErr} />}
          <form onSubmit={handlePassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={LABEL}>Current password</label>
              <input type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} required autoComplete="current-password" style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>New password</label>
              <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} required minLength={8} autoComplete="new-password" style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Confirm new password</label>
              <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} required autoComplete="new-password" style={INPUT} />
            </div>
            <div><SaveBtn saving={pwdSaving} label="Change password" /></div>
          </form>
        </div>
      )}

      {/* Admin badge */}
      {role === 'admin' && (
        <div style={{ ...SECTION, borderColor: 'rgba(232,177,74,0.3)', background: 'rgba(232,177,74,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '5px', background: 'rgba(232,177,74,0.15)', color: 'var(--accent)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '1px' }}>ADMIN</span>
            <span style={{ fontSize: '13px', color: 'var(--text-faint)' }}>Your account has administrator privileges.</span>
            <a href="/admin" style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Admin panel →</a>
          </div>
        </div>
      )}

      {/* Danger zone */}
      <div style={{ ...SECTION, borderColor: 'rgba(226,100,92,0.3)' }}>
        <div style={{ ...SECTION_TITLE, color: '#e2645c', borderBottomColor: 'rgba(226,100,92,0.2)' }}>Danger zone</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '3px' }}>Delete account</div>
            <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>Permanently removes your account, all decks, and collection data.</div>
          </div>
          <button onClick={handleDelete} disabled={deleting} style={{
            padding: '8px 18px', background: 'rgba(226,100,92,0.1)', border: '1px solid rgba(226,100,92,0.4)',
            color: '#e2645c', fontWeight: 700, fontSize: '13px', borderRadius: '8px',
            cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1,
            fontFamily: "'IBM Plex Sans', sans-serif", flexShrink: 0,
          }}>
            {deleting ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </div>
    </div>
  );
}
