/** Source of randomness — inject a seeded one in tests. Returns [0, 1). */
export type Rng = () => number

/**
 * How the engine defers work (delays between rounds). The server implements
 * this with setTimeout; tests implement it with a manual queue so time is
 * deterministic.
 */
export interface Scheduler {
  schedule(fn: () => void, delayMs: number): void
}

export const systemScheduler: Scheduler = {
  schedule: (fn, delayMs) => setTimeout(fn, delayMs),
}

/**
 * Deterministic RNG from a string seed (FNV-1a → mulberry32).
 *
 * Used by the Mão do Dia so every player on every server gets byte-identical
 * deals for a given day. Pure and dependency-free, so it belongs with the
 * engine rather than the delivery layer.
 */
export const createSeededRng = (seed: string): Rng => {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }

  let state = hash >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
