'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/** Matches `@bridou/cards-ui` Card `variant` — dark is the noite de jogo default. */
export type DeckVariant = 'light' | 'dark'

const STORAGE_KEY = 'bridou.deckVariant'

interface DeckThemeContextValue {
  variant: DeckVariant
  setVariant: (variant: DeckVariant) => void
}

const DeckThemeContext = createContext<DeckThemeContextValue>({
  variant: 'dark',
  setVariant: () => {},
})

export const useDeckTheme = () => useContext(DeckThemeContext)

const readStored = (): DeckVariant => {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark') return value
  } catch {
    // private mode / SSR — fall through
  }
  return 'dark'
}

export function DeckThemeProvider({ children }: { children: ReactNode }) {
  const [variant, setVariantState] = useState<DeckVariant>('dark')

  useEffect(() => {
    setVariantState(readStored())
  }, [])

  const setVariant = (next: DeckVariant) => {
    setVariantState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore quota / private mode
    }
  }

  return (
    <DeckThemeContext.Provider value={{ variant, setVariant }}>{children}</DeckThemeContext.Provider>
  )
}
