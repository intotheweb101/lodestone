'use client';
import { useAuth } from '@/components/auth-provider';
import { usePathname } from 'next/navigation';

export function AdminLink() {
  const { user } = useAuth();
  const pathname = usePathname();
  if (!user || user.role !== 'admin') return null;
  const active = pathname.startsWith('/admin');
  return (
    <a href="/admin" className="ls-nav-item" title="Admin" style={{ background: active ? '#163436' : undefined }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? '#e8b14a' : 'currentColor'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    </a>
  );
}
