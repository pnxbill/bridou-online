'use client'

import { Card as PlayingCard } from '@bridou/cards-ui'
import type { Card, TurnSnapshot } from '@bridou/shared'
import { parseCard } from '../cards'

interface Props {
  playedCards: Card[]
  currentTurn: TurnSnapshot | null
  turnNumber: number
  maxTurns: number
}

export function Table({ playedCards, currentTurn, turnNumber, maxTurns }: Props) {
  const turnComplete = !!currentTurn && playedCards.length === currentTurn.players.length
  const nextPlayer = !currentTurn || turnComplete ? null : currentTurn.players[playedCards.length]

  return (
    <div className="table">
      <div className="turn-counter">
        {Math.min(turnNumber, maxTurns)}/{maxTurns}
      </div>
      <div className="table-cards">
        {playedCards.map((card, i) => (
          <div key={card} className="table-slot">
            <div className="table-card">
              <PlayingCard id={card} {...parseCard(card)} variant="dark" />
            </div>
            <span className="table-player">{currentTurn?.players[i]?.name}</span>
          </div>
        ))}
        {nextPlayer && (
          <div className="table-slot waiting">
            <div className="table-card">
              <PlayingCard id="waiting" rank="A" suit="spades" faceUp={false} variant="dark" />
            </div>
            <span className="table-player current">{nextPlayer.name}…</span>
          </div>
        )}
      </div>
    </div>
  )
}
