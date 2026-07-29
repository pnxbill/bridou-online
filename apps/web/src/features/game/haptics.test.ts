import { describe, expect, it } from 'vitest'
import {
  DROP,
  PICK_UP,
  PLAY,
  SELECT,
  areHapticsMuted,
  hapticCardDrop,
  hapticCardPickUp,
  hapticCardPlay,
  hapticCardSelect,
  setHapticsMuted,
} from './haptics'

// vitest runs in node here — no window, no document, which is also what the
// server render sees. The module has to stay quiet instead of exploding.
describe('haptics without a browser', () => {
  it('no-ops on the server', () => {
    expect(() => {
      hapticCardPickUp()
      hapticCardDrop()
      hapticCardPlay()
      hapticCardSelect()
    }).not.toThrow()
  })

  it('tracks the mute preference', () => {
    expect(areHapticsMuted()).toBe(false)
    setHapticsMuted(true)
    expect(areHapticsMuted()).toBe(true)
    expect(() => hapticCardPlay()).not.toThrow()
    setHapticsMuted(false)
    expect(areHapticsMuted()).toBe(false)
  })
})

describe('the patterns', () => {
  const patterns = { PICK_UP, DROP, PLAY, SELECT }

  it('stay inside what the Vibration API will take', () => {
    for (const [name, pattern] of Object.entries(patterns)) {
      for (const step of pattern as Array<{ duration: number; intensity?: number }>) {
        expect(step.duration, name).toBeGreaterThan(0)
        expect(step.duration, name).toBeLessThanOrEqual(1000) // web-haptics clamps above this
        expect(step.intensity ?? 1, name).toBeGreaterThan(0)
        expect(step.intensity ?? 1, name).toBeLessThanOrEqual(1)
      }
    }
  })

  // the whole point is telling them apart with the phone in your hand
  it('are all distinct', () => {
    const shapes = Object.values(patterns).map((p) => JSON.stringify(p))
    expect(new Set(shapes).size).toBe(shapes.length)
  })
})
