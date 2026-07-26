import type { MetadataRoute } from 'next'

/**
 * Served at /manifest.webmanifest — Next injects the <link rel="manifest">.
 *
 * The icons in public/icons are rasterized from the gold-spade mark in
 * `icon.svg`: the "any" pair keeps the squircle and gold rim, the "maskable"
 * pair is the same spade full-bleed on navy with ~20% padding so Android's
 * circle/squircle crop never clips it. iOS ignores all of this and uses
 * `apple-icon.png` instead.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bridou Online',
    short_name: 'Bridou',
    description: 'Jogo de cartas online com os amigos — 13 rodadas, apostas, trunfo e bailadores.',
    lang: 'pt-BR',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    // matches viewport.themeColor in layout.tsx — the felt's night sky
    theme_color: '#0b1120',
    background_color: '#0b1120',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
