'use client'

import { Card as PlayingCard } from '@bridou/cards-ui'
import type { Card } from '@bridou/shared'
import { parseCard } from '../cards'

export function Trunfo({ card }: { card: Card }) {
  if (!card) return null

  return (
    <div className="trunfo">
      <span>Trunfo</span>
      <div className="trunfo-card">
        <PlayingCard id={card} {...parseCard(card)} variant="dark" />
      </div>
    </div>
  )
}
