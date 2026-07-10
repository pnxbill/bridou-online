import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
import type { ReactNode } from 'react'
import { AuthProvider } from '@/features/auth/AuthProvider'
import './globals.css'

// The card faces (@bridou/cards-ui) are designed around Outfit
const outfit = Outfit({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Bridou Online',
  description: 'Bridou online',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // the game screen is a fixed table — no pinch zoom fighting the card drags
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0b1120',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={outfit.className}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
