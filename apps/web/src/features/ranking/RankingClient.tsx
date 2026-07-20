'use client'

import type { RankingEntry } from '@bridou/shared'
import Link from 'next/link'
import { useEffect, useState } from 'react'
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
      <Link href="/" className={styles.back}>
        ← início
      </Link>

      <div className={styles.heading}>
        <span className={styles.eyebrow}>só valem mesas sem bots</span>
        <h1 className={styles.title}>Ranking</h1>
      </div>

      <div className={styles.panel}>
        {error && <p className={styles.status}>{error}</p>}
        {!error && entries === null && <p className={styles.status}>Embaralhando…</p>}
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
