'use client'

/**
 * Vendored from github.com/pnxbill/cards-lib @ 47bc27c.
 * Local changes: 'use client' directive; disabled cards can't be selected or
 * clicked (no vibration either) but stay draggable for hand organization —
 * they also sit slightly lower in the fan, while playable cards keep the
 * gold glow (drop shadows stay stripped inside the fan). Cards mount flying
 * in from above (the table side) so staggered deals read as dealing, and
 * each card carries `data-card-id` so the app can measure where a card sat
 * on screen when it was played.
 */
import React from 'react'
import { Card, type CardProps } from './Card'
import { Reorder } from 'framer-motion'

export type HandCard = Omit<CardProps, 'onClick' | 'className' | 'style'>

export interface HandProps {
  cards: HandCard[]
  onCardClick?: (index: number) => void
  onReorder?: (newOrder: HandCard[]) => void
  selectedCardIndex?: number
  className?: string
  style?: React.CSSProperties
}

export const Hand: React.FC<HandProps> = ({
  cards,
  onCardClick,
  onReorder,
  selectedCardIndex,
  className = '',
  style,
}) => {
  const [draggingId, setDraggingId] = React.useState<string | null>(null)
  const [isFineTuning, setIsFineTuning] = React.useState(false)
  const dragTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDraggingRef = React.useRef(false)

  const handleDragStart = (id: string) => {
    isDraggingRef.current = true
    setDraggingId(id)
    setIsFineTuning(false)

    // Clear any existing timer
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current)
    }

    // Start timer for fine-tuning mode
    dragTimeoutRef.current = setTimeout(() => {
      setIsFineTuning(true)
    }, 250)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setIsFineTuning(false)
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current)
    }
    // Small delay to prevent click from firing immediately after drag
    setTimeout(() => {
      isDraggingRef.current = false
    }, 50)
  }

  // Max 7 cards as per requirements
  const displayCards = cards.slice(0, 7)
  const totalCards = displayCards.length
  const centerIndex = (totalCards - 1) / 2

  // Dynamic scaling: fewer cards = larger size
  // Scale from 1.0 (7 cards) to 1.4 (1 card)
  const baseScale = totalCards > 0 ? 1 + (0.4 * (7 - totalCards)) / 6 : 1

  const containerStyles: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center', // Changed from flex-end to center to avoid clipping
    height: '220px',
    padding: '20px',
    width: '100%',
    boxSizing: 'border-box',
    touchAction: 'none',
    perspective: '1000px',
    transformStyle: 'preserve-3d', // Enable 3D stacking
    ...style,
  }

  return (
    <Reorder.Group
      axis="x"
      values={displayCards}
      onReorder={onReorder || (() => {})}
      className={`hand ${className}`}
      style={{ ...containerStyles, listStyle: 'none', margin: 0 }}
      as="div"
    >
      {displayCards.map((card, index) => {
        const isSelected = index === selectedCardIndex
        const isDraggingAny = draggingId !== null
        const draggingIndex = displayCards.findIndex((c) => c.id === draggingId)

        // Arc calculations
        const distanceFromCenter = index - centerIndex
        const rotate = distanceFromCenter * 5 // 5 degrees per unit
        const arcOffset = Math.abs(distanceFromCenter) * Math.abs(distanceFromCenter) * 2 // Parabolic Y offset
        // Unplayable cards sink a bit — readable but visibly out of reach
        const yOffset = arcOffset + (card.disabled ? 16 : 0)
        const zOffset = index * 10 // Ascending z-index: Rightmost cards are closer to camera

        // Dynamic margin calculation
        let marginLeft = index === 0 ? '0' : '-60px'
        if (isDraggingAny && isFineTuning && draggingIndex !== -1) {
          // Expand space around the dragged card
          if (index === draggingIndex || index === draggingIndex + 1) {
            marginLeft = '-20px'
          }
        }

        // Unique key using ID
        const key = card.id

        return (
          <Reorder.Item
            key={key}
            value={card}
            layout // Explicit layout prop
            data-card-id={card.id}
            onDragStart={() => handleDragStart(card.id)}
            onDragEnd={handleDragEnd}
            style={{
              marginLeft,
              zIndex: draggingId === card.id || isSelected ? 999 : 'auto', // Only force zIndex for drag/select
              position: 'relative',
              listStyle: 'none',
              transformOrigin: 'bottom center',
              borderRadius: '8px',
            }}
            initial={{ opacity: 0, scale: 0.5, y: -140 }}
            whileDrag={{
              scale: 1.1 * baseScale,
              zIndex: 999,
              boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
              rotate: 0,
              z: 0, // Bring to front in 3D too
            }}
            animate={{
              opacity: 1,
              y: isSelected ? -50 : yOffset,
              rotate: rotate,
              // preserve-3d stacks by translateZ, so the selected card must sit
              // above the fan's max zOffset (60) — kept small vs. the 1000px
              // perspective so the projection stays sane
              z: isSelected ? 80 : zOffset,
              scale: isSelected ? 1.1 * baseScale : baseScale,
            }}
            transition={{
              opacity: { duration: 0.15, ease: 'easeOut' },
              scale: { duration: 0.15, ease: 'easeOut' },
              y: { type: 'spring', stiffness: 300, damping: 20 },
              rotate: { type: 'spring', stiffness: 300, damping: 20 },
              z: { type: 'spring', stiffness: 300, damping: 20 },
            }}
          >
            <Card
              {...card}
              onClick={() => {
                if (isDraggingRef.current || card.disabled) return
                navigator?.vibrate?.(50) // Short 50ms vibration
                onCardClick && onCardClick(index)
              }}
              style={{
                // Drop shadows off inside the fan, but keep the playable glow
                boxShadow:
                  !card.disabled && onCardClick
                    ? '0 0 14px rgba(251, 191, 36, 0.35)'
                    : 'none',
              }}
            />
          </Reorder.Item>
        )
      })}
    </Reorder.Group>
  )
}
