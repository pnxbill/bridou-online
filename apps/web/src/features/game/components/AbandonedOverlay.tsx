'use client'

import type { AbandonedSeat, RoundPlayer } from '@bridou/shared'
import { useEffect, useState } from 'react'

interface Props {
  seats: AbandonedSeat[]
  players: RoundPlayer[]
}

/** The game is paused: show who left and when the bot takes their seat. */
export function AbandonedOverlay({ seats, players }: Props) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])

  const nameOf = (playerId: string) =>
    players.find((p) => p.id === playerId)?.name ?? playerId

  return (
    <div className="overlay">
      <div className="overlay-panel">
        <h2>Partida pausada</h2>
        {seats.map((seat) => {
          const secondsLeft = Math.max(0, Math.ceil((seat.resumeAt - now) / 1000))
          return (
            <p key={seat.playerId} className="abandoned-row">
              <strong>{nameOf(seat.playerId)}</strong> saiu da partida.
              <br />
              {secondsLeft > 0
                ? `O bot 🤖 assume em ${secondsLeft}s…`
                : 'O bot 🤖 está assumindo…'}
            </p>
          )
        })}
      </div>
    </div>
  )
}
