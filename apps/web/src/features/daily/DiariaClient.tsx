'use client'

import { dailyDateLabel, type DailyState, type HandCard } from '@bridou/shared'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { GameTable } from '@/features/game/components/GameTable'
import { gameReducer, stateFromSnapshot } from '@/features/game/reducer'
import { ApiError, api, type DailyResponse, type GameEntry } from '@/lib/api'
import { DailyResultBar, DailyResultOverlay } from './DailyResultOverlay'
import { useScriptedEvents } from './useScriptedEvents'
import styles from './Diaria.module.css'

/** The day's table in the shape the game screen already consumes. */
const entryFrom = (table: DailyState['table']): GameEntry => ({
  ...table.snapshot,
  playableCards: table.playableCards,
  availableBets: table.availableBets,
  abandoned: [],
  botSeats: [],
  time: Date.now(),
  pausedBy: null,
})

const message = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback

/**
 * A Mão do Dia.
 *
 * One deal, the same for everybody, once a day — and you *play* it: call your
 * bet, then lead and follow all five tricks against the three bots everyone
 * else is facing too. It runs on the real table, driven by the real reducer;
 * the only difference from a live game is where the events come from. The
 * server resolves each play instantly and hands back what the table did in
 * reply, and `useScriptedEvents` deals that out at the speed a real table
 * would have — so the hand is watched, not reported.
 */
export function DiariaClient() {
  const { user, loading: authLoading, signIn } = useAuth()
  const [state, setState] = useState<DailyState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  if (authLoading || loading) return <p className={styles.notice}>Carregando…</p>

  if (!user) {
    return (
      <div className={styles.gate}>
        <h1 className={styles.gateTitle}>Mão do Dia</h1>
        <p className={styles.gateText}>
          Uma mão por dia, a mesma pra todo mundo. Mesmas cartas, mesmos
          adversários — só o seu jogo muda o placar.
        </p>
        <button className="btn primary" onClick={signIn}>
          Entrar com Google
        </button>
      </div>
    )
  }

  if (!state) return <p className={styles.notice}>{error || 'Indisponível.'}</p>

  // Keyed by date so a hand that rolls over midnight restarts clean.
  return <DailyTable key={state.date} initial={state} myId={user.id} />
}

function DailyTable({ initial, myId }: { initial: DailyState; myId: string }) {
  /** The daily seat id, straight from the deal — the table's leader is the human. */
  const seat = initial.table.snapshot.leaderId
  const [daily, setDaily] = useState(initial)
  const [view, dispatch] = useReducer(gameReducer, initial.table, (table) =>
    stateFromSnapshot(entryFrom(table), seat),
  )
  const { enqueue, reset, playing } = useScriptedEvents(dispatch)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showResult, setShowResult] = useState(true)

  // A hand nobody has bet on yet gets its cards dealt into the fan, the same
  // riffle a live table opens with. A hand already in progress is picked up
  // where it stands, so there is nothing to deal.
  const dealt = useRef(false)
  useEffect(() => {
    if (dealt.current || !initial.table.betting) return
    dealt.current = true
    dispatch({
      type: 'apply-event',
      event: {
        type: 'cards-dealt',
        playerId: seat,
        cards: initial.table.playableCards.map((c) => c.value),
      },
    })
  }, [initial, seat])

  const resync = useCallback(async () => {
    reset()
    try {
      const { daily: fresh } = await api.daily()
      setDaily(fresh)
      dispatch({ type: 'sync', snapshot: entryFrom(fresh.table) })
    } catch {
      // server unreachable — the table stays where it is and the player retries
    }
  }, [reset])

  const apply = ({ daily: fresh, events }: DailyResponse) => {
    setDaily(fresh)
    enqueue(events)
  }

  const onBet = async (bet: number) => {
    if (busy) return
    setBusy(true)
    setError('')
    dispatch({ type: 'clear-bets' })
    try {
      apply(await api.dailyBet(bet))
    } catch (err) {
      setError(message(err, 'Não deu pra enviar a aposta.'))
      await resync()
    } finally {
      setBusy(false)
    }
  }

  const onPlay = async (card: HandCard) => {
    if (card.disabled || busy) return
    setBusy(true)
    setError('')
    dispatch({ type: 'optimistic-play', card: card.value })
    try {
      apply(await api.dailyPlay(card.value))
    } catch (err) {
      setError(message(err, 'Não deu pra jogar essa carta.'))
      await resync()
    } finally {
      setBusy(false)
    }
  }

  const label = [
    `Mão do Dia · ${dailyDateLabel(daily.date)}`,
    daily.streak > 0 ? `🔥 ${daily.streak}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  // Never while the hand is still being dealt out — the overlay would announce
  // the ending over the top of the trick that produced it.
  const done = daily.result !== null && !playing

  return (
    <>
      <GameTable state={view} onPlay={onPlay} onBet={onBet} roundLabel={label} />

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {done && daily.result && showResult && (
        <DailyResultOverlay
          date={daily.date}
          result={daily.result}
          leaderboard={daily.leaderboard}
          streak={daily.streak}
          myId={myId}
          onClose={() => setShowResult(false)}
        />
      )}
      {done && daily.result && !showResult && (
        <DailyResultBar result={daily.result} onOpen={() => setShowResult(true)} />
      )}
    </>
  )
}
