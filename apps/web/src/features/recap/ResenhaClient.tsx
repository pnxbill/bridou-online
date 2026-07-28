'use client'

import { achievementById, type GameRecap } from '@bridou/shared'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { PointsChart } from './PointsChart'
import { colorsByPlayer } from './series-colors'
import styles from './Resenha.module.css'

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')

const formatDuration = (ms: number) => {
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours}h${String(minutes % 60).padStart(2, '0')}`
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

/** The one-line summary that actually gets pasted into the group chat. */
const shareText = (recap: GameRecap): string => {
  const champion = recap.finalScoreboard[0]
  const lines = [
    `🃏 Resenha da mesa — ${champion?.name} venceu com ${champion?.totalPoints} pontos!`,
  ]
  for (const award of recap.awards.slice(0, 3)) {
    lines.push(`${award.icon} ${award.label}: ${award.playerName} (${award.detail})`)
  }
  return lines.join('\n')
}

export function ResenhaClient({ gameId }: { gameId: string }) {
  const [recap, setRecap] = useState<GameRecap | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .recap(gameId)
      .then(({ recap }) => {
        if (!cancelled) setRecap(recap)
      })
      .catch(() => {
        if (!cancelled) setError('Não achamos a resenha dessa partida.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [gameId])

  // Colour follows the seat, not the final rank, so the chart and the podium agree.
  const colors = useMemo(
    () => colorsByPlayer((recap?.players ?? []).map((p) => p.id)),
    [recap],
  )

  const unlocksByPlayer = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const unlock of recap?.unlocks ?? []) {
      map.set(unlock.playerId, [...(map.get(unlock.playerId) ?? []), unlock.achievementId])
    }
    return map
  }, [recap])

  if (loading) return <p className={styles.muted}>Carregando a resenha…</p>
  if (error || !recap) return <p className={styles.error}>{error || 'Resenha indisponível.'}</p>

  const champion = recap.finalScoreboard[0]
  const text = shareText(recap)
  const url = typeof window !== 'undefined' ? window.location.href : ''

  const share = async () => {
    const payload = { title: 'Resenha da Mesa — Bridou', text, url }
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(payload)
        return
      } catch {
        // user dismissed the sheet — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Não deu pra copiar. Copie o link da barra de endereço.')
    }
  }

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.kicker}>Resenha da mesa</p>
        {champion && (
          <>
            <span className={styles.crown} aria-hidden>
              👑
            </span>
            <h1 className={styles.champion}>{champion.name}</h1>
            <p className={styles.championPoints}>{champion.totalPoints} pontos</p>
          </>
        )}
        <p className={styles.meta}>
          {formatDate(recap.playedAt)} · {recap.players.length} jogadores ·{' '}
          {formatDuration(recap.durationMs)}
          {!recap.ranked && ' · não vale ranking'}
        </p>
      </header>

      <div className={styles.actions}>
        <a className="btn" href={whatsapp} target="_blank" rel="noreferrer">
          Mandar no WhatsApp
        </a>
        <button className="btn" onClick={share}>
          {copied ? 'Copiado!' : 'Compartilhar'}
        </button>
      </div>

      {recap.awards.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Os prêmios</h2>
          <ul className={styles.awards}>
            {recap.awards.map((award) => (
              <li key={award.id} className={styles.award}>
                <span className={styles.awardIcon} aria-hidden>
                  {award.icon}
                </span>
                <div className={styles.awardBody}>
                  <strong className={styles.awardLabel}>{award.label}</strong>
                  <span className={styles.awardWinner}>{award.playerName}</span>
                  <span className={styles.awardDetail}>{award.detail}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section}>
        <PointsChart
          players={recap.players}
          progression={recap.progression}
          colors={colors}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Placar final</h2>
        <ol className={styles.standings}>
          {recap.finalScoreboard.map((entry, i) => {
            const unlocks = unlocksByPlayer.get(entry.id) ?? []
            return (
              <li key={entry.id} className={styles.standing} data-first={i === 0 ? '' : undefined}>
                <span className={styles.position}>{i + 1}</span>
                <span className={styles.dot} style={{ background: colors[entry.id] }} aria-hidden />
                {entry.photoURL ? (
                  <img className={styles.avatar} src={entry.photoURL} alt="" />
                ) : (
                  <span className={styles.avatarFallback} aria-hidden>
                    {initials(entry.name)}
                  </span>
                )}
                <span className={styles.standingName}>
                  {entry.name}
                  {entry.isBot && <span className={styles.bot}> 🤖</span>}
                  {unlocks.length > 0 && (
                    <span className={styles.unlocks}>
                      {unlocks.map((id) => {
                        const def = achievementById(id)
                        return def ? (
                          <span key={id} title={def.name} className={styles.unlock}>
                            {def.icon}
                          </span>
                        ) : null
                      })}
                    </span>
                  )}
                </span>
                <strong className={styles.points}>{entry.totalPoints}</strong>
              </li>
            )
          })}
        </ol>
      </section>

      {recap.biggestComeback && recap.biggestComeback.positions > 0 && (
        <p className={styles.footnote}>
          Maior recuperação: <strong>{recap.biggestComeback.playerName}</strong> subiu{' '}
          {recap.biggestComeback.positions}{' '}
          {recap.biggestComeback.positions === 1 ? 'posição' : 'posições'} desde a rodada 7.
        </p>
      )}
    </div>
  )
}
