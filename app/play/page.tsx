import type { Metadata } from 'next';
import { PlayLayout } from './play-layout';

export const metadata: Metadata = {
  title: 'Play — Lodestone',
  description: 'Life counter and Planechase for Magic: The Gathering.',
};

export default function PlayPage() {
  return <PlayLayout />;
}
