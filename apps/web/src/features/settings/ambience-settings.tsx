'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { startAmbience, stopAmbience } from '@/features/game/ambience'
import { useSoundSettings } from './sound-settings'

const STORAGE_KEY = 'bridou.ambience'

interface AmbienceContextValue {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
}

const AmbienceContext = createContext<AmbienceContextValue>({
  enabled: false,
  setEnabled: () => {},
})

export const useAmbience = () => useContext(AmbienceContext)

const readStored = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Room tone, off by default.
 *
 * Ambience is the kind of thing that delights half the players and irritates
 * the other half, so it's opt-in and it obeys the global mute — muting the game
 * has to mute *everything*, or the toggle is a lie.
 */
export function AmbienceProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false)
  const { muted } = useSoundSettings()

  useEffect(() => {
    setEnabledState(readStored())
  }, [])

  useEffect(() => {
    if (enabled && !muted) startAmbience()
    else stopAmbience()
  }, [enabled, muted])

  // Never leave a tone running behind a closed tab.
  useEffect(() => stopAmbience, [])

  const setEnabled = (next: boolean) => {
    setEnabledState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      // ignore quota / private mode
    }
  }

  return (
    <AmbienceContext.Provider value={{ enabled, setEnabled }}>{children}</AmbienceContext.Provider>
  )
}
