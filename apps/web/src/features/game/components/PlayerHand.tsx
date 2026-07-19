'use client'

import { Hand, type HandCard as LibHandCard } from '@bridou/cards-ui'
import type { Card, HandCard } from '@bridou/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useDeckTheme } from '@/features/settings/deck-theme'
import { useHandOrder } from '@/features/settings/hand-order'
import { orderHand, parseCard, sortHand, toLibCard } from '../cards'

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
  const { prefs } = useHandOrder()
  // lazy init: a page refresh mounts straight into a mid-round hand (no
  // cards-dealt event fires), so the toggles must apply here too
  const [arrangement, setArrangement] = useState<string[]>(() =>
    sortHand(cards, prefs, trunfo).map((c) => c.value),
  )
  const [selected, setSelected] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // hand-order prefs load from localStorage a tick after mount (SSR starts
  // with the "none" default) — re-apply once they arrive, unless the player
  // has already dragged a card into a manual arrangement.
  const userArranged = useRef(false)
  useEffect(() => {
    if (userArranged.current) return
    setArrangement(sortHand(cards, prefs, trunfo).map((c) => c.value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs])

  // Dealing: reveal cards one at a time. Infinity = not dealing, show all.
  const [revealed, setRevealed] = useState(Infinity)
  const prevSeq = useRef(dealSeq)
  if (dealSeq !== prevSeq.current) {
    // render-phase reset (not an effect) so the freshly dealt hand never
    // flashes fully fanned for a frame before the deal starts
    prevSeq.current = dealSeq
    setRevealed(0)
    // apply the player's organization toggles to the freshly dealt hand;
    // manual drags afterwards overwrite this arrangement as before
    setArrangement(sortHand(cards, prefs, trunfo).map((c) => c.value))
    userArranged.current = false
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
    userArranged.current = true
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
