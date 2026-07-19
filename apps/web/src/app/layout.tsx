import type { Metadata, Viewport } from 'next'
import { Outfit, Playfair_Display } from 'next/font/google'
import type { ReactNode } from 'react'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { VoiceRoomProvider } from '@/features/game/voice/VoiceRoomProvider'
import { DeckThemeProvider } from '@/features/settings/deck-theme'
import { HandOrderProvider } from '@/features/settings/hand-order'
import { SettingsCog } from '@/features/settings/SettingsCog'
import { SoundSettingsProvider } from '@/features/settings/sound-settings'
import './globals.css'

// The card faces (@bridou/cards-ui) are designed around Outfit
const outfit = Outfit({ subsets: ['latin'] })

// Display serif for the big moments (overlay titles) — exposed as a CSS
// variable so any module can opt in via var(--font-display)
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-display' })

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
      <body className={`${outfit.className} ${playfair.variable}`}>
        <AuthProvider>
          <DeckThemeProvider>
            <HandOrderProvider>
              <SoundSettingsProvider>
                <VoiceRoomProvider>
                  <SettingsCog />
                  {children}
                </VoiceRoomProvider>
              </SoundSettingsProvider>
            </HandOrderProvider>
          </DeckThemeProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
