'use client'

import type { HandCard } from '@bridou/shared'

interface Props {
  cards: HandCard[]
  onPlay: (card: HandCard) => void
}

export function Hand({ cards, onPlay }: Props) {
  if (!cards.length) return null

  return (
    <div className="hand">
      {cards.map((card) => (
        <button
          key={card.value}
          className="card-btn"
          disabled={card.disabled}
          onClick={() => onPlay(card)}
        >
          <img className="card" src={`/cards/${card.value}.svg`} alt={card.value} />
        </button>
      ))}
    </div>
  )
}
