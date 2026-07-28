'use client'

import type { DomainEvent } from '@bridou/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameAction } from '@/features/game/reducer'

/**
 * How long to hold on an event before the next one lands, in ms.
 *
 * A live table gets this pacing for free — the events arrive as the humans and
 * bots actually act. The daily hand is resolved server-side in one shot, so
 * without this the whole trick would appear at once and the player would be
 * back to reading a result instead of watching a hand. The trick pause matches
 * the engine's own `TRICK_RESOLUTION_MS`, so it feels like the same game.
 */
const HOLD: Partial<Record<DomainEvent['type'], number>> = {
  'player-bet': 480,
  'turn-started': 260,
  'card-played': 700,
  'turn-ended': 1400,
  'round-ended': 500,
}

/**
 * Plays a scripted event log into the game reducer at the speed a real table
 * would have produced it.
 *
 * Returns `playing` so the caller can hold back anything that would spoil what
 * is still being dealt out — the result overlay, mostly.
 */
export function useScriptedEvents(dispatch: (action: GameAction) => void) {
  const queue = useRef<DomainEvent[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const running = useRef(false)
  const [playing, setPlaying] = useState(false)

  const step = useCallback(() => {
    const next = queue.current.shift()
    if (!next) {
      running.current = false
      setPlaying(false)
      return
    }
    dispatch({ type: 'apply-event', event: next })
    timer.current = setTimeout(step, HOLD[next.type] ?? 0)
  }, [dispatch])

  const enqueue = useCallback(
    (events: DomainEvent[]) => {
      if (!events.length) return
      queue.current.push(...events)
      if (running.current) return
      running.current = true
      setPlaying(true)
      step()
    },
    [step],
  )

  /** Drops anything still queued — used when a rejected action forces a resync. */
  const reset = useCallback(() => {
    queue.current = []
    if (timer.current) clearTimeout(timer.current)
    running.current = false
    setPlaying(false)
  }, [])

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  return { enqueue, reset, playing }
}
