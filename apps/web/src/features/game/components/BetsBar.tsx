'use client'

import type { RoundPlayer } from '@bridou/shared'

interface Props {
  players: RoundPlayer[]
  betting: boolean
  botSeats?: string[]
}

export function BetsBar({ players, betting, botSeats = [] }: Props) {
  const currentBettor = betting ? players.find((p) => p.bet === null) : undefined

  return (
    <div className="bets-bar">
      {players.map((player) => (
        <div
          key={player.id}
          className={`bet-chip${player.id === currentBettor?.id ? ' betting' : ''}`}
        >
          {player.photoURL && <img className="avatar" src={player.photoURL} alt="" />}
          <span className="bet-name">
            {botSeats.includes(player.id) && <span title="Bot jogando">🤖 </span>}
            {player.name}
          </span>
          <span className="bet-value">
            {player.bet !== null ? player.bet : player.id === currentBettor?.id ? 'pedindo…' : '–'}
          </span>
          {player.made !== null && <span className="bet-made">({player.made})</span>}
        </div>
      ))}
    </div>
  )
}
