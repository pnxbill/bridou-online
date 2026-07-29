import type { Metadata, Viewport } from 'next'
import { Outfit, Playfair_Display } from 'next/font/google'
import type { ReactNode } from 'react'
import { RegisterServiceWorker } from '@/components/RegisterServiceWorker'
import { StandaloneViewport } from '@/components/StandaloneViewport'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { VoiceRoomProvider } from '@/features/game/voice/VoiceRoomProvider'
import { AmbienceProvider } from '@/features/settings/ambience-settings'
import { DeckThemeProvider } from '@/features/settings/deck-theme'
import { HandOrderProvider } from '@/features/settings/hand-order'
import { HapticsSettingsProvider } from '@/features/settings/haptics-settings'
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
  // installed on iOS: launch standalone with the dark status bar over the felt
  appleWebApp: {
    capable: true,
    title: 'Bridou',
    statusBarStyle: 'black-translucent',
  },
  // `capable` only emits the standardized <meta mobile-web-app-capable>, which
  // iOS honors from 16.4 up; the legacy alias keeps older iPhones standalone.
  other: { 'apple-mobile-web-app-capable': 'yes' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // the game screen is a fixed table — no pinch zoom fighting the card drags
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0b1120',
  // installed on iOS the felt runs edge to edge under the translucent status
  // bar; this is what makes env(safe-area-inset-*) resolve to real values
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${outfit.className} ${playfair.variable}`}>
        <RegisterServiceWorker />
        <StandaloneViewport />
        <AuthProvider>
          <DeckThemeProvider>
            <HandOrderProvider>
              <SoundSettingsProvider>
                {/* nests inside sound settings — the room tone obeys the mute */}
                <AmbienceProvider>
                  <HapticsSettingsProvider>
                    <VoiceRoomProvider>{children}</VoiceRoomProvider>
                  </HapticsSettingsProvider>
                </AmbienceProvider>
              </SoundSettingsProvider>
            </HandOrderProvider>
          </DeckThemeProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
