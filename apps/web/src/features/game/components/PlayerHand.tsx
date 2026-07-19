'use client'

import { Hand, type HandCard as LibHandCard } from '@bridou/cards-ui'
import type { Card, HandCard } from '@bridou/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useDeckTheme } from '@/features/settings/deck-theme'
import { orderHand, parseCard, toLibCard } from '../cards'

interface Props {
  cards: HandCard[]
  /** The trump card, so hand cards of that suit get a trump badge. */
  trunfo: Card | null
  /** `origin` is where the card sat on screen when tapped — feeds the fan-to-table motion. */
  onPlay: (card: HandCard, origin?: DOMRect) => void
  /** Bumps once per deal — triggers the card-by-card dealing animation. */
  dealSeq?: number
}

/** Delay between cards landing in the fan while dealing. */
const DEAL_STAGGER_MS = 130

/**
 * The player's fanned hand: drag to rearrange (kept locally — the server
 * doesn't know about hand order), tap to select and lift a card, tap the
 * lifted card again to play it. When a new round is dealt the cards land
 * in the fan one by one, flying in from the table side.
 */
export function PlayerHand({ cards, trunfo, onPlay, dealSeq = 0 }: Props) {
  const { variant } = useDeckTheme()
  const [arrangement, setArrangement] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Dealing: reveal cards one at a time. Infinity = not dealing, show all.
  const [revealed, setRevealed] = useState(Infinity)
  const prevSeq = useRef(dealSeq)
  if (dealSeq !== prevSeq.current) {
    // render-phase reset (not an effect) so the freshly dealt hand never
    // flashes fully fanned for a frame before the deal starts
    prevSeq.current = dealSeq
    setRevealed(0)
  }
  useEffect(() => {
    if (revealed >= cards.length) return
    const timer = setTimeout(() => setRevealed((n) => n + 1), DEAL_STAGGER_MS)
    return () => clearTimeout(timer)
  }, [revealed, cards.length])

  const trumpSuit = useMemo(() => (trunfo ? parseCard(trunfo).suit : undefined), [trunfo])
  const ordered = useMemo(() => orderHand(cards, arrangement), [cards, arrangement])
  const visible = revealed >= ordered.length ? ordered : ordered.slice(0, revealed)
  const libCards = useMemo(
    () => visible.map((c) => toLibCard(c, variant, trumpSuit)),
    [visible, variant, trumpSuit],
  )

  // Keep the Hand mounted even when empty so its fixed height still
  // reserves the thumb zone — otherwise the table flexes into that space.
  const selectedIndex = visible.findIndex((c) => c.value === selected && !c.disabled)

  const handleCardClick = (index: number) => {
    const card = visible[index]
    if (!card || card.disabled) return

    if (selected !== card.value) {
      setSelected(card.value)
      return
    }
    setSelected(null)
    const el = wrapRef.current?.querySelector(`[data-card-id="${CSS.escape(card.value)}"]`)
    onPlay(card, el?.getBoundingClientRect())
  }

  const handleReorder = (newOrder: LibHandCard[]) => {
    setArrangement(newOrder.map((c) => c.id))
  }

  return (
    <div ref={wrapRef}>
      <Hand
        cards={libCards}
        selectedCardIndex={selectedIndex === -1 ? undefined : selectedIndex}
        onCardClick={handleCardClick}
        onReorder={handleReorder}
      />
    </div>
  )
}
