import { redirect } from 'next/navigation';
import { runMigrations } from '@/lib/db/migrations';
import { requireUser } from '@/lib/auth/session';
import { getUserFull } from '@/lib/auth/index';
import { AccountSettingsClient } from './account-settings-client';
import { ApiKeysPanel } from './api-keys-panel';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  runMigrations();

  let user;
  try {
    user = await requireUser();
  } catch {
    redirect('/login');
  }

  const full = getUserFull(user.id);
  if (!full) redirect('/login');

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '2rem 1.5rem', color: 'var(--text)' }}>
      <div style={{ marginBottom: '2rem' }}>
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'var(--accent)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
          Account
        </p>
        <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em' }}>Settings</h1>
      </div>

      <AccountSettingsClient
        id={full.id}
        name={full.name}
        email={full.email}
        username={full.username ?? ''}
        bio={full.bio ?? ''}
        hasPassword={!!full.password_hash}
        isGoogleLinked={!!full.google_id}
        role={full.role}
      />

      <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
        <ApiKeysPanel userId={full.id} />
      </div>
    </div>
  );
}
