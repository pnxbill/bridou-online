'use client'

import type { Card } from '@bridou/shared'

export function Trunfo({ card }: { card: Card }) {
  if (!card) return null

  return (
    <div className="trunfo">
      <span>Trunfo</span>
      <img className="card small" src={`/cards/${card}.svg`} alt={card} />
    </div>
  )
}
