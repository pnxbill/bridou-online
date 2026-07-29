'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { setHapticsMuted } from '@/features/game/haptics'

const STORAGE_KEY = 'bridou.hapticsMuted'

interface HapticsSettingsContextValue {
  muted: boolean
  setMuted: (muted: boolean) => void
}

const HapticsSettingsContext = createContext<HapticsSettingsContextValue>({
  muted: false,
  setMuted: () => {},
})

export const useHapticsSettings = () => useContext(HapticsSettingsContext)

const readStored = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function HapticsSettingsProvider({ children }: { children: ReactNode }) {
  const [muted, setMutedState] = useState(false)

  useEffect(() => {
    const stored = readStored()
    setMutedState(stored)
    setHapticsMuted(stored)
  }, [])

  const setMuted = (next: boolean) => {
    setMutedState(next)
    setHapticsMuted(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      // ignore quota / private mode
    }
  }

  return (
    <HapticsSettingsContext.Provider value={{ muted, setMuted }}>
      {children}
    </HapticsSettingsContext.Provider>
  )
}
