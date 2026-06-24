import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Lodestone — MTG',
    short_name: 'Lodestone',
    description: 'MTG deck builder, NZ price finder, and play companion.',
    start_url: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#07151a',
    theme_color: '#07151a',
    categories: ['games', 'utilities'],
    icons: [
      { src: '/icon.png',       sizes: '32x32',   type: 'image/png' },
      { src: '/icon-192.png',   sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png',   sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcuts: [
      { name: 'Life Counter', url: '/play',       icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'My Decks',     url: '/decks',      icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'Search Cards', url: '/',           icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
