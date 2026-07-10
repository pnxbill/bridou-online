'use client'

import { Hand, type HandCard as LibHandCard } from '@bridou/cards-ui'
import type { HandCard } from '@bridou/shared'
import { useMemo, useState } from 'react'
import { orderHand, toLibCard } from '../cards'

interface Props {
  cards: HandCard[]
  onPlay: (card: HandCard) => void
}

/**
 * The player's fanned hand: drag to rearrange (kept locally — the server
 * doesn't know about hand order), tap to select and lift a card, tap the
 * lifted card again to play it.
 */
export function PlayerHand({ cards, onPlay }: Props) {
  const [arrangement, setArrangement] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  const ordered = useMemo(() => orderHand(cards, arrangement), [cards, arrangement])
  const libCards = useMemo(() => ordered.map(toLibCard), [ordered])

  // Keep the Hand mounted even when empty so its fixed height still
  // reserves the thumb zone — otherwise the table flexes into that space.
  const selectedIndex = ordered.findIndex((c) => c.value === selected && !c.disabled)

  const handleCardClick = (index: number) => {
    const card = ordered[index]
    if (!card || card.disabled) return

    if (selected !== card.value) {
      setSelected(card.value)
      return
    }
    setSelected(null)
    onPlay(card)
  }

  const handleReorder = (newOrder: LibHandCard[]) => {
    setArrangement(newOrder.map((c) => c.id))
  }

  return (
    <Hand
      cards={libCards}
      selectedCardIndex={selectedIndex === -1 ? undefined : selectedIndex}
      onCardClick={handleCardClick}
      onReorder={handleReorder}
    />
  )
}
