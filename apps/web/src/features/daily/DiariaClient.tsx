'use client'

import { Card as PlayingCard } from '@bridou/cards-ui'
import { cardSuit, type DailyState } from '@bridou/shared'
import { useEffect, useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { parseCard } from '@/features/game/cards'
import { useDeckTheme } from '@/features/settings/deck-theme'
import { ApiError, api } from '@/lib/api'
import styles from './Diaria.module.css'

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')

/**
 * A Mão do Dia.
 *
 * One deal, the same for everybody, once a day: read the hand, call the number
 * of vazas, and the hand gets played out for you. Thirty seconds and a score to
 * argue about — the reason to open the app on a night nobody else is around.
 */
export function DiariaClient() {
  const { user, loading: authLoading, signIn } = useAuth()
  const { variant } = useDeckTheme()
  const [state, setState] = useState<DailyState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [bet, setBet] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    let cancelled = false
    api
      .daily()
      .then(({ daily }) => {
        if (!cancelled) setState(daily)
      })
      .catch(() => {
        if (!cancelled) setError('Não deu pra carregar a mão de hoje.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const submit = async () => {
    if (bet === null || busy) return
    setBusy(true)
    setError('')
    try {
      const { daily } = await api.playDaily(bet)
      setState(daily)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não deu pra enviar a aposta.')
    } finally {
      setBusy(false)
    }
  }

  const share = async () => {
    if (!state?.attempt) return
    const { bet, made, points, exact } = state.attempt
    const text = exact
      ? `🃏 Mão do Dia: apostei ${bet}, fiz ${made}. ${points} pontos. 🎯`
      : `🃏 Mão do Dia: apostei ${bet}, fiz ${made}. Bailei. 💃`
    const url = `${window.location.origin}/diaria`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Bridou — Mão do Dia', text, url })
        return
      } catch {
        // dismissed
      }
    }
    await navigator.clipboard.writeText(`${text}\n${url}`).catch(() => {})
  }

  if (authLoading || loading) return <p className={styles.muted}>Carregando…</p>

  if (!user) {
    return (
      <div className={styles.empty}>
        <h1 className={styles.title}>Mão do Dia</h1>
        <p className={styles.muted}>
          Uma mão por dia, a mesma pra todo mundo. Entre pra jogar a de hoje.
        </p>
        <button className="btn" onClick={signIn}>
          Entrar com Google
        </button>
      </div>
    )
  }

  if (!state) return <p className={styles.error}>{error || 'Indisponível.'}</p>

  const { puzzle, attempt, leaderboard, streak } = state
  const trunfoSuit = cardSuit(puzzle.trunfo)

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Mão do Dia</h1>
          <p className={styles.muted}>{puzzle.date}</p>
        </div>
        {streak > 0 && (
          <span className={styles.streak} title={`${streak} dias seguidos`}>
            🔥 {streak}
          </span>
        )}
      </header>

      <section className={styles.trunfoRow}>
        <span className={styles.label}>Trunfo</span>
        <div className={styles.trunfoCard}>
          <PlayingCard
            id={puzzle.trunfo}
            {...parseCard(puzzle.trunfo)}
            variant={variant}
          />
        </div>
      </section>

      <section>
        <span className={styles.label}>Sua mão</span>
        <div className={styles.hand}>
          {puzzle.hand.map((card) => (
            <div
              key={card}
              className={styles.handCard}
              data-trunfo={cardSuit(card) === trunfoSuit ? '' : undefined}
            >
              <PlayingCard id={card} {...parseCard(card)} variant={variant} />
            </div>
          ))}
        </div>
      </section>

      {error && <p className={styles.error}>{error}</p>}

      {attempt ? (
        <section className={styles.result} data-exact={attempt.exact ? '' : undefined}>
          <p className={styles.resultHeadline}>
            {attempt.exact ? 'Cravou!' : 'Bailou.'}
          </p>
          <p className={styles.resultDetail}>
            Você apostou <strong>{attempt.bet}</strong> e fez <strong>{attempt.made}</strong>.
          </p>
          <p className={styles.resultPoints}>
            {attempt.points > 0 ? `+${attempt.points}` : attempt.points} pontos
          </p>
          <button className="btn" onClick={share}>
            Compartilhar
          </button>
        </section>
      ) : (
        <section className={styles.betSection}>
          <span className={styles.label}>Quantas vazas você faz?</span>
          <div className={styles.bets}>
            {puzzle.availableBets.map((value) => (
              <button
                key={value}
                className={styles.betButton}
                data-selected={bet === value ? '' : undefined}
                onClick={() => setBet(value)}
              >
                {value}
              </button>
            ))}
          </div>
          <button className="btn" onClick={submit} disabled={bet === null || busy}>
            {busy ? 'Jogando…' : 'Apostar'}
          </button>
          <p className={styles.hint}>
            Você só escolhe a aposta — a mão é jogada pra você. Uma tentativa por dia.
          </p>
        </section>
      )}

      {leaderboard.length > 0 && (
        <section>
          <h2 className={styles.subtitle}>Hoje</h2>
          <ol className={styles.board}>
            {leaderboard.map((row) => (
              <li
                key={row.id}
                className={styles.boardRow}
                data-me={row.id === user.id ? '' : undefined}
              >
                <span className={styles.position}>{row.position}</span>
                {row.photoURL ? (
                  <img className={styles.avatar} src={row.photoURL} alt="" />
                ) : (
                  <span className={styles.avatarFallback} aria-hidden>
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
        </section>
      )}
    </div>
  )
}
