/**
 * Table haptics — the felt you can feel through the glass.
 *
 * `navigator.vibrate` is Android-only (Safari has never shipped it), so this
 * goes through `web-haptics`: it drives the Vibration API where it exists and
 * falls back to the hidden `<label for=switch-input>` click on iOS, which is
 * the one way a web page gets the Taptic Engine to fire. Same call, both
 * phones.
 *
 * Kept as a module singleton (like `sounds.ts`) so the whole app shares one
 * engine — the iOS fallback appends a hidden element to <body>, and one is
 * plenty. Patterns are tuned to be told apart with the phone in your palm:
 * a card lifts light, locks sharp, and lands with a slap-then-settle.
 */

import { WebHaptics, type HapticInput } from 'web-haptics'

/** Card lifts off the fan when you start dragging it — feather-light. */
export const PICK_UP: HapticInput = [{ duration: 12, intensity: 0.45 }]

/** Card locks back into the fan when you let go — one short, hard click. */
export const DROP: HapticInput = [{ duration: 10, intensity: 1 }]

/** Card hits the table: the slap, then the felt absorbing it. */
export const PLAY: HapticInput = [
  { duration: 18, intensity: 0.9 },
  { delay: 45, duration: 26, intensity: 0.4 },
]

/** Tapping a card to lift it — barely there, it repeats a lot. */
export const SELECT: HapticInput = [{ duration: 8, intensity: 0.3 }]

let engine: WebHaptics | null = null
let muted = false

/** Wired from HapticsSettingsProvider — also readable before React mounts. */
export const setHapticsMuted = (value: boolean) => {
  muted = value
  if (muted) engine?.cancel()
}

export const areHapticsMuted = () => muted

// Prefer the stored preference before the settings provider hydrates.
if (typeof window !== 'undefined') {
  try {
    muted = localStorage.getItem('bridou.hapticsMuted') === '1'
  } catch {
    // private mode
  }
}

const getEngine = (): WebHaptics | null => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  if (!engine) engine = new WebHaptics()
  return engine
}

const buzz = (pattern: HapticInput) => {
  if (muted) return
  const haptics = getEngine()
  if (!haptics) return
  // fire-and-forget: the promise resolves when the pattern finishes playing,
  // and nothing on the table waits for a vibration
  void haptics.trigger(pattern).catch(() => {
    // a device that refuses to buzz is not a reason to break the tap
  })
}

/** You picked a card up out of the fan to move it. */
export const hapticCardPickUp = () => buzz(PICK_UP)

/** You dropped it and the fan closed around it again. */
export const hapticCardDrop = () => buzz(DROP)

/** You played a card onto the table. */
export const hapticCardPlay = () => buzz(PLAY)

/** You tapped a card to lift it (not played yet). */
export const hapticCardSelect = () => buzz(SELECT)
