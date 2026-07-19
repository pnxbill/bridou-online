'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * Auto-organization of the hand fan, applied when a round's cards are dealt.
 * Toggles are combinable; all off (the default) keeps the dealt order.
 */
export interface HandOrderPrefs {
  /** Cards of the same suit sit together. */
  bySuit: boolean
  /** Weakest → strongest (within each suit when bySuit is also on). */
  byStrength: boolean
  /** Trump-suit cards pushed to the right end of the fan. */
  trumpsLast: boolean
}

export const DEFAULT_HAND_ORDER: HandOrderPrefs = {
  bySuit: false,
  byStrength: false,
  trumpsLast: false,
}

const STORAGE_KEY = 'bridou.handOrder'

interface HandOrderContextValue {
  prefs: HandOrderPrefs
  setPrefs: (prefs: HandOrderPrefs) => void
}

const HandOrderContext = createContext<HandOrderContextValue>({
  prefs: DEFAULT_HAND_ORDER,
  setPrefs: () => {},
})

export const useHandOrder = () => useContext(HandOrderContext)

const readStored = (): HandOrderPrefs => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<HandOrderPrefs>
      return {
        bySuit: !!parsed.bySuit,
        byStrength: !!parsed.byStrength,
        trumpsLast: !!parsed.trumpsLast,
      }
    }
  } catch {
    // private mode / SSR / corrupt value — fall through
  }
  return DEFAULT_HAND_ORDER
}

export function HandOrderProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsState] = useState<HandOrderPrefs>(DEFAULT_HAND_ORDER)

  useEffect(() => {
    setPrefsState(readStored())
  }, [])

  const setPrefs = (next: HandOrderPrefs) => {
    setPrefsState(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore quota / private mode
    }
  }

  return (
    <HandOrderContext.Provider value={{ prefs, setPrefs }}>{children}</HandOrderContext.Provider>
  )
}
