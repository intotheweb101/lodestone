import type { Metadata } from 'next';
import { LifeCounter } from './life-counter';

export const metadata: Metadata = {
  title: 'Life Counter — Lodestone',
  description: 'MTG life counter with commander damage and poison tracking for 2–6 players.',
};

export default function PlayPage() {
  return <LifeCounter />;
}
