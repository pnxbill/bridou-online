'use client'

import { Card as PlayingCard } from '@bridou/cards-ui'
import type { RoundPlayer } from '@bridou/shared'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useDeckTheme } from '@/features/settings/deck-theme'
import { parseCard, winningCardIndex } from '../cards'
import type { CompletedTrick } from '../reducer'
import styles from './TrickHistoryPopup.module.css'

export type AnchorRect = Pick<DOMRect, 'top' | 'left' | 'bottom' | 'right' | 'width' | 'height'>

interface Props {
  player: RoundPlayer
  tricks: Array<{ trick: CompletedTrick; roundIndex: number }>
  trunfo: string
  anchor: AnchorRect
  onClose: () => void
}

const GAP = 8
const EDGE = 8

/** Compact review of a seat’s taken tricks, anchored near the avatar. */
export function TrickHistoryPopup({ player, tricks, trunfo, anchor, onClose }: Props) {
  const { variant } = useDeckTheme()
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    const place = () => {
      const { width: pw, height: ph } = panel.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight

      /* prefer below the avatar; flip above when the bottom would clip */
      let top = anchor.bottom + GAP
      if (top + ph > vh - EDGE) {
        top = Math.max(EDGE, anchor.top - GAP - ph)
      }

      let left = anchor.left + anchor.width / 2 - pw / 2
      left = Math.min(Math.max(EDGE, left), vw - EDGE - pw)

      setPos({ top, left })
    }

    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchor])

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-label={`Feitas de ${player.name}`}
        style={pos ? { top: pos.top, left: pos.left } : { top: anchor.bottom + GAP, left: anchor.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>{player.name}</h2>
          <span className={styles.count}>
            fez <b>{tricks.length}</b>/{player.bet ?? 0}
          </span>
        </header>

        {tricks.length === 0 ? (
          <p className={styles.empty}>Nenhuma feita</p>
        ) : (
          <ul className={styles.tricks}>
            {tricks.map(({ trick, roundIndex }) => {
              const winIdx = winningCardIndex(trick.turn.playedCards, trunfo)
              return (
                <li key={`${trick.winnerId}-${roundIndex}`} className={styles.trick}>
                  <div className={styles.cards}>
                    {trick.turn.playedCards.map((card, ci) => {
                      const owner = trick.turn.players[ci]
                      const winning = ci === winIdx
                      return (
                        <div
                          key={card}
                          className={`${styles.cardWrap} ${winning ? styles.cardWinning : ''}`}
                          title={owner?.name}
                        >
                          <PlayingCard
                            id={`hist-${player.id}-${roundIndex}-${card}`}
                            {...parseCard(card)}
                            variant={variant}
                          />
                        </div>
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
