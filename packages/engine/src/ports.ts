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
