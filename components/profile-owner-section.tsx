'use client';

import { useState } from 'react';
import { ProfileEditForm } from './profile-edit-form';

interface ProfileOwnerSectionProps {
  initialName: string;
  initialBio: string;
}

export function ProfileOwnerSection({ initialName, initialBio }: ProfileOwnerSectionProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [bio, setBio] = useState(initialBio);

  if (editing) {
    return (
      <ProfileEditForm
        initialName={name}
        initialBio={bio}
        onDone={(newName, newBio) => {
          setName(newName);
          setBio(newBio);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      style={{
        marginTop: 10, padding: '6px 14px',
        background: 'transparent', border: '1px solid var(--border)',
        borderRadius: 8, cursor: 'pointer',
        color: 'var(--text-muted)', fontSize: 12,
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
    >
      Edit profile
    </button>
  );
}
