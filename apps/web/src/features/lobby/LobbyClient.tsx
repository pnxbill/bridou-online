'use client'

import { MAX_PLAYERS, type LobbySnapshot } from '@bridou/shared'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { VoiceControls } from '@/features/game/voice/VoiceControls'
import { useVoiceRoom } from '@/features/game/voice/VoiceRoomProvider'
import { ApiError, api } from '@/lib/api'
import { openChannel } from '@/lib/realtime'
import { InvitePanel } from './InvitePanel'
import styles from './Lobby.module.css'

/** 7 fixed seats around the round lobby table, starting at the top. */
const seatPosition = (index: number) => {
  const angle = ((-90 + (index * 360) / MAX_PLAYERS) * Math.PI) / 180
  const round2 = (n: number) => Math.round(n * 100) / 100
  return {
    x: round2(50 + 44 * Math.cos(angle)),
    y: round2(50 + 44 * Math.sin(angle)),
  }
}

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')

/**
 * A table filling up, reachable by code: everyone can watch the seats,
 * logged-in players sit with one tap (invite links sign you in first),
 * the leader seats bots and starts the game. The invite panel makes
 * bringing friends in a one-tap affair: copy link, WhatsApp, share sheet.
 */
export function LobbyClient({ code }: { code: string }) {
  const router = useRouter()
  const { user, loading, signIn } = useAuth()
  const [lobby, setLobby] = useState<LobbySnapshot | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [startedWithoutMe, setStartedWithoutMe] = useState(false)
  // Set when a logged-out visitor taps "sentar": after sign-in we seat them.
  const wantsSeat = useRef(false)

  const seated = !!user && !!lobby?.players.some((p) => p.id === user.id)
  const seatedRef = useRef(seated)
  seatedRef.current = seated

  // Same room id becomes the game id — join voice here and keep talking in-game.
  const { voice, enter, exit } = useVoiceRoom()
  const lobbyIdForVoice = lobby?.lobbyId
  useEffect(() => {
    if (!seated || !user || !lobbyIdForVoice) return
    enter(lobbyIdForVoice, user.id)
    return () => exit(lobbyIdForVoice, user.id)
  }, [seated, user, lobbyIdForVoice, enter, exit])

  // Anonymous viewers still get live roster updates through a spectator id.
  const [viewerId] = useState(() => `viewer-${Math.random().toString(36).slice(2, 10)}`)

  useEffect(() => {
    api
      .lobby(code)
      .then(({ lobby }) => setLobby(lobby))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true)
        else setError('Servidor indisponível')
      })
  }, [code])

  const lobbyId = lobby?.lobbyId
  useEffect(() => {
    if (!lobbyId) return

    const channel = openChannel(lobbyId, user?.id ?? viewerId, {
      onEvent: (name, payload) => {
        if (name === 'lobby-updated') setLobby(payload as LobbySnapshot)
        if (name === 'game-started') {
          if (seatedRef.current) router.push(`/game/${lobbyId}`)
          else setStartedWithoutMe(true)
        }
      },
      onReconnect: () => {
        api
          .lobby(code)
          .then(({ lobby }) => setLobby(lobby))
          .catch(() => {})
      },
    })

    return () => channel.close()
  }, [lobbyId, user?.id, viewerId, code, router])

  const act = async (action: () => Promise<unknown>, fallback: string) => {
    setError('')
    try {
      await action()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback)
    }
  }

  const sitDown = () =>
    act(async () => {
      if (!user) return
      const { lobby } = await api.joinLobby(code, user)
      setLobby(lobby)
    }, 'Não foi possível sentar na mesa')

  // Invite flow for the logged-out: sign in, then the effect below seats them.
  const signInAndSit = () => {
    wantsSeat.current = true
    signIn()
  }

  useEffect(() => {
    if (user && wantsSeat.current && lobby && !seated) {
      wantsSeat.current = false
      void sitDown()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, lobby, seated])

  const standUp = () =>
    act(async () => {
      if (!user) return
      const { lobby } = await api.leaveLobby(code, user.id)
      setLobby(lobby)
    }, 'Não foi possível levantar da mesa')

  const addBot = () =>
    act(() => api.addBot(code, user!.id), 'Não foi possível adicionar o bot')

  const startGame = () =>
    act(() => api.startGame(code, user!.id), 'Não foi possível começar')

  if (loading && !lobby) return <p className="hint">Carregando…</p>

  if (notFound) {
    return (
      <div className={styles.lobby}>
        <h1 className={styles.title}>Mesa não encontrada</h1>
        <p className={styles.subtitle}>
          o código <b>{code.toUpperCase()}</b> não está aberto — a mesa pode já ter começado
        </p>
        <div className={styles.actions}>
          <button
            className={`${styles.action} ${styles.actionPrimary}`}
            onClick={() => router.push('/')}
          >
            Voltar ao início
          </button>
        </div>
      </div>
    )
  }

  if (!lobby) return <p className="hint">{error || 'Carregando…'}</p>

  const { players, leaderId } = lobby
  const isLeader = !!user && leaderId === user.id
  const canStart = isLeader && players.length >= 2
  const tableFull = players.length >= MAX_PLAYERS

  return (
    <div className={styles.lobby}>
      <h1 className={styles.title}>Mesa {lobby.code}</h1>
      <p className={styles.subtitle}>
        <b>{players.length}</b>/{MAX_PLAYERS} na mesa
      </p>

      <div className={styles.tableArea}>
        <div className={styles.felt} />
        <span className={styles.feltLogo}>BRIDOU</span>

        {Array.from({ length: MAX_PLAYERS }, (_, i) => {
          const pos = seatPosition(i)
          const player = players[i]
          return (
            <div
              key={player?.id ?? `empty-${i}`}
              className={styles.seat}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              {player ? (
                <>
                  <span
                    className={`${styles.avatar} ${player.isBot ? styles.avatarBot : ''} ${
                      voice.speakingIds.includes(player.id) ? styles.avatarSpeaking : ''
                    }`}
                  >
                    {player.isBot ? '🤖' : player.photoURL ? (
                      <img src={player.photoURL} alt="" />
                    ) : (
                      initials(player.name)
                    )}
                  </span>
                  <span
                    className={`${styles.seatName} ${player.id === leaderId ? styles.seatLeader : ''}`}
                  >
                    {player.id === leaderId && '★ '}
                    {player.name}
                  </span>
                  {player.isBot && <span className={styles.botTag}>bot</span>}
                </>
              ) : (
                <>
                  <span className={styles.emptyAvatar} />
                  <span className={styles.seatNameEmpty}>vazio</span>
                </>
              )}
            </div>
          )
        })}
      </div>

      {seated && !tableFull && <InvitePanel code={lobby.code} />}

      <div className={styles.actions}>
        {!user && !startedWithoutMe && !tableFull && (
          <button className={`${styles.action} ${styles.actionPrimary}`} onClick={signInAndSit}>
            Entrar e sentar na mesa
          </button>
        )}
        {user && !seated && !tableFull && (
          <button className={`${styles.action} ${styles.actionPrimary}`} onClick={sitDown}>
            Sentar na mesa
          </button>
        )}
        {isLeader && !tableFull && (
          <button className={styles.action} onClick={addBot}>
            Adicionar bot 🤖
          </button>
        )}
        {canStart && (
          <button className={`${styles.action} ${styles.actionPrimary}`} onClick={startGame}>
            COMEÇAR
          </button>
        )}
        {seated && (
          <button className={styles.actionQuiet} onClick={standUp}>
            levantar da mesa
          </button>
        )}
      </div>

      {startedWithoutMe && <p className={styles.waiting}>o jogo começou sem você 😢</p>}
      {seated && !isLeader && !startedWithoutMe && (
        <p className={styles.waiting}>esperando o líder começar…</p>
      )}
      {isLeader && !canStart && (
        <p className={styles.waiting}>chame mais alguém ou adicione um bot…</p>
      )}
      {error && <p className={styles.error}>{error}</p>}

      {seated && user && <VoiceControls voice={voice} players={players} />}
    </div>
  )
}
