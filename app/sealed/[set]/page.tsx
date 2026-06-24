import { runMigrations } from '@/lib/db/migrations';
import { generateSealedPool } from '@/lib/sealed/packs';
import { getCurrentUser } from '@/lib/auth/session';
import { notFound } from 'next/navigation';
import { PoolBuilder } from './pool-builder';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ set: string }>;
}): Promise<Metadata> {
  const { set } = await params;
  return { title: `Sealed — ${set.toUpperCase()} — Lodestone` };
}

export default async function SealedSetPage({
  params,
  searchParams,
}: {
  params: Promise<{ set: string }>;
  searchParams: Promise<{ packs?: string }>;
}) {
  runMigrations();
  const { set } = await params;
  const { packs: packsParam } = await searchParams;
  const packCount = Math.min(12, Math.max(4, parseInt(packsParam ?? '6', 10) || 6));

  const pool = generateSealedPool(set, packCount);
  if (!pool) notFound();

  const user = await getCurrentUser();
  const userId = user && user.id !== 'local' ? user.id : null;

  return <PoolBuilder pool={pool} userId={userId} />;
}
