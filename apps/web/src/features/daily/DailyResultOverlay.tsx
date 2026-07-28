'use client'

import { dailyShareText, type DailyLeaderboardRow, type DailyResult } from '@bridou/shared'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useState } from 'react'
import { Confetti } from '@/features/game/components/Confetti'
import styles from './Diaria.module.css'

interface Props {
  date: string
  result: DailyResult
  leaderboard: DailyLeaderboardRow[]
  streak: number
  /** The signed-in player, so their row on the board stands out. */
  myId: string
  onClose: () => void
}

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')

/**
 * How today went.
 *
 * The grid is the point: five squares, one per trick, in the order they were
 * played. It reads at a glance, it pastes into a group chat, and it says
 * nothing about which cards were in the hand — so the first person to play
 * can't spoil it for the rest of the mesa.
 */
export function DailyResultOverlay({
  date,
  result,
  leaderboard,
  streak,
  myId,
  onClose,
}: Props) {
  const [shared, setShared] = useState(false)
  const { bet, made, points, exact, trickWins, par } = result

  const share = async () => {
    const text = dailyShareText(date, result, streak)
    const url = `${window.location.origin}/diaria`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Bridou — Mão do Dia', text, url })
        return
      } catch {
        // dismissed — fall through to the clipboard
      }
    }
    await navigator.clipboard.writeText(`${text}\n${url}`).catch(() => {})
    setShared(true)
  }

  return (
    <div className={styles.overlay}>
      {exact && <Confetti count={70} />}
      <motion.div
        className={styles.panel}
        initial={{ scale: 0.75, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        <button type="button" className={styles.close} onClick={onClose} aria-label="Ver a mesa">
          ×
        </button>

        <span className={styles.emoji}>{exact ? '🎯' : '💃'}</span>
        <h2 className={`${styles.title} ${exact ? styles.titleExact : styles.titleBailou}`}>
          {exact ? 'CRAVOU!' : 'BAILOU!'}
        </h2>
        <p className={styles.subtitle}>
          pediu <b>{bet}</b> · fez <b>{made}</b>
        </p>

        <div className={styles.grid} aria-label={`${made} de ${trickWins.length} feitas`}>
          {trickWins.map((won, i) => (
            <span
              key={i}
              className={styles.gridCell}
              data-won={won ? '' : undefined}
              title={`Feita ${i + 1}`}
            />
          ))}
        </div>

        <p className={styles.points} data-negative={points < 0 ? '' : undefined}>
          {points > 0 ? `+${points}` : points}
        </p>

        {par !== null &&
          (points >= par ? (
            <p className={styles.par}>Nada melhor era possível hoje. Mão perfeita.</p>
          ) : (
            <p className={styles.par}>
              O máximo de hoje era <b>{par}</b>.
            </p>
          ))}

        {streak > 0 && (
          <p className={styles.streak}>
            🔥 {streak} {streak === 1 ? 'dia seguido' : 'dias seguidos'}
          </p>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.actionPrimary} onClick={share}>
            {shared ? 'Copiado!' : 'Compartilhar'}
          </button>
          <Link href="/" className={styles.action}>
            Início
          </Link>
        </div>

        {leaderboard.length > 0 && (
          <>
            <h3 className={styles.boardTitle}>Hoje</h3>
            <ol className={styles.board}>
              {leaderboard.map((row) => (
                <li
                  key={row.id}
                  className={styles.boardRow}
                  data-me={row.id === myId ? '' : undefined}
                >
                  <span className={styles.position}>{row.position}</span>
                  {row.photoURL ? (
                    <img className={styles.avatar} src={row.photoURL} alt="" />
                  ) : (
                    <span className={styles.avatar} aria-hidden>
                      {initials(row.name)}
                    </span>
                  )}
                  <span className={styles.boardName}>{row.name}</span>
                  <span className={styles.boardBet}>
                    {row.bet}/{row.made}
                  </span>
                  <strong className={styles.boardPoints} data-exact={row.exact ? '' : undefined}>
                    {row.points}
                  </strong>
                </li>
              ))}
            </ol>
          </>
        )}

        <p className={styles.tomorrow}>Volta amanhã — mão nova pra todo mundo.</p>
      </motion.div>
    </div>
  )
}

/** The result once the overlay is dismissed, so the felt can be studied. */
export function DailyResultBar({
  result,
  onOpen,
}: {
  result: DailyResult
  onOpen: () => void
}) {
  return (
    <div className={styles.resultBar}>
      <span className={styles.resultBarText}>
        {result.exact ? '🎯' : '💃'} pediu <b>{result.bet}</b> · fez <b>{result.made}</b> ·{' '}
        <b>{result.points > 0 ? `+${result.points}` : result.points}</b>
      </span>
      <button type="button" className={styles.resultBarBtn} onClick={onOpen}>
        Detalhes
      </button>
    </div>
  )
}
