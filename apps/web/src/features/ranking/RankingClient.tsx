'use client'

import type { RankingEntry } from '@bridou/shared'
import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/Loading'
import { api } from '@/lib/api'
import styles from './Ranking.module.css'

const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')

export function RankingClient() {
  const [entries, setEntries] = useState<RankingEntry[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api
      .rankings()
      .then(({ rankings }) => {
        if (!cancelled) setEntries(rankings)
      })
      .catch(() => {
        if (!cancelled) setError('Servidor indisponível')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className={styles.screen}>
      <div className={styles.heading}>
        <span className={styles.eyebrow}>só valem mesas sem bots</span>
        <h1 className={styles.title}>Ranking</h1>
      </div>

      <div className={styles.panel}>
        {error && <p className={styles.status}>{error}</p>}
        {/* The sheet is already on screen — only the rows are missing, so we
            draw the rows rather than replace the sheet with a spinner. */}
        {!error && entries === null && <RankingSkeleton />}
        {entries !== null && entries.length === 0 && (
          <p className={styles.status}>
            Nenhuma partida ranqueada ainda.
            <br />
            Termine uma mesa só de humanos para estrear aqui.
          </p>
        )}
        {entries !== null && entries.length > 0 && (
          <ol className={styles.rows}>
            {entries.map((entry, i) => (
              <li key={entry.playerId} className={`${styles.row} ${i < 3 ? styles.rowTop : ''}`}>
                <span className={styles.pos}>{i + 1}º</span>
                <span className={styles.avatar}>
                  {entry.photoURL ? <img src={entry.photoURL} alt="" /> : initials(entry.name)}
                </span>
                <span className={styles.who}>
                  <span className={styles.name}>{entry.name}</span>
                  <span className={styles.sub}>
                    {entry.gamesPlayed} {entry.gamesPlayed === 1 ? 'jogo' : 'jogos'} ·{' '}
                    {entry.bailadas} {entry.bailadas === 1 ? 'bailada' : 'bailadas'}
                  </span>
                </span>
                <span className={styles.score}>
                  <span className={styles.wins}>{entry.wins}</span>
                  <span className={styles.winsLabel}>
                    {entry.wins === 1 ? 'vitória' : 'vitórias'} · {Math.round(entry.winRate * 100)}%
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

/** The score sheet's own rows, drawn empty: the podium's gold filete included,
 *  so the first three seats don't slide into place when the data lands. */
function RankingSkeleton() {
  return (
    <ol className={styles.rows} role="status" aria-live="polite">
      <li className={styles.srOnly}>Embaralhando…</li>
      {Array.from({ length: 6 }, (_, i) => (
        <li
          key={i}
          className={`${styles.row} ${i < 3 ? styles.rowTop : ''}`}
          style={{ '--d': `${i * 0.09}s` } as React.CSSProperties}
          aria-hidden
        >
          <span className={styles.pos}>{i + 1}º</span>
          <Skeleton className={styles.skeletonAvatar} />
          <span className={styles.who}>
            <Skeleton width={`${62 - (i % 3) * 12}%`} height="0.9rem" radius="4px" />
            <Skeleton width={`${40 - (i % 2) * 8}%`} height="0.65rem" radius="4px" />
          </span>
          <span className={styles.score}>
            <Skeleton width="1.6rem" height="1.1rem" radius="4px" />
            <Skeleton width="3.2rem" height="0.6rem" radius="4px" />
          </span>
        </li>
      ))}
    </ol>
  )
}
