'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { setSoundsMuted } from '@/features/game/sounds'

const STORAGE_KEY = 'bridou.soundsMuted'

interface SoundSettingsContextValue {
  muted: boolean
  setMuted: (muted: boolean) => void
}

const SoundSettingsContext = createContext<SoundSettingsContextValue>({
  muted: false,
  setMuted: () => {},
})

export const useSoundSettings = () => useContext(SoundSettingsContext)

const readStored = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function SoundSettingsProvider({ children }: { children: ReactNode }) {
  const [muted, setMutedState] = useState(false)

  useEffect(() => {
    const stored = readStored()
    setMutedState(stored)
    setSoundsMuted(stored)
  }, [])

  const setMuted = (next: boolean) => {
    setMutedState(next)
    setSoundsMuted(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      // ignore quota / private mode
    }
  }

  return (
    <SoundSettingsContext.Provider value={{ muted, setMuted }}>
      {children}
    </SoundSettingsContext.Provider>
  )
}
