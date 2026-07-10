'use client'

import type { RoundPlayer } from '@bridou/shared'
import { useVoiceChat, type VoiceParticipant } from './useVoiceChat'
import styles from './VoiceControls.module.css'

interface Props {
  gameId: string
  playerId: string
  /** Seats of the current round — used to show names/photos in the roster. */
  players: RoundPlayer[]
}

/**
 * Voice chat dock in the corner of the game screen. Off by default: a single
 * "Entrar na voz" button joins with open mic; once in, buttons to mute the
 * mic, mute incoming audio (deafen) and leave, plus who's in the room.
 */
export function VoiceControls({ gameId, playerId, players }: Props) {
  const voice = useVoiceChat({ gameId, playerId })

  if (voice.status === 'error') {
    return (
      <div className={styles.dock}>
        <div className={styles.error}>
          {voice.error === 'mic-denied'
            ? 'Microfone bloqueado — libere o acesso nas permissões do navegador.'
            : 'Não deu para entrar na voz agora.'}
          <div>
            <button type="button" className={styles.retry} onClick={voice.join}>
              Tentar de novo
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (voice.status !== 'connected') {
    return (
      <div className={styles.dock}>
        <button
          type="button"
          className={styles.joinButton}
          onClick={voice.join}
          disabled={voice.status === 'joining'}
        >
          🎙️ {voice.status === 'joining' ? 'Conectando…' : 'Entrar na voz'}
          {voice.status === 'idle' && voice.othersInVoice > 0 && (
            <span className={styles.joinCount}>{voice.othersInVoice}</span>
          )}
        </button>
      </div>
    )
  }

  return (
    <div className={styles.dock}>
      <div className={styles.panel}>
        <div className={styles.buttons}>
          <button
            type="button"
            className={`${styles.control} ${voice.micMuted ? styles.controlActive : ''}`}
            onClick={voice.toggleMic}
            title={voice.micMuted ? 'Ativar microfone' : 'Mutar microfone'}
          >
            {voice.micMuted ? '🔇' : '🎙️'}
          </button>
          <button
            type="button"
            className={`${styles.control} ${voice.deafened ? styles.controlActive : ''}`}
            onClick={voice.toggleDeafen}
            title={voice.deafened ? 'Ativar áudio' : 'Mutar áudio'}
          >
            {voice.deafened ? '🙉' : '🎧'}
          </button>
          <button
            type="button"
            className={`${styles.control} ${styles.controlLeave}`}
            onClick={voice.leave}
            title="Sair da voz"
          >
            📴
          </button>
        </div>

        {voice.participants.length === 0 ? (
          <p className={styles.alone}>Só você na voz por enquanto</p>
        ) : (
          <ul className={styles.people}>
            {voice.participants.map((participant) => (
              <Person
                key={participant.playerId}
                participant={participant}
                player={players.find((p) => p.id === participant.playerId)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Person({
  participant,
  player,
}: {
  participant: VoiceParticipant
  player?: RoundPlayer
}) {
  const name = player?.name ?? participant.playerId

  const state =
    participant.connection === 'failed' ? (
      <span className={`${styles.personState} ${styles.personFailed}`}>sem conexão</span>
    ) : participant.connection === 'connecting' ? (
      <span className={`${styles.personState} ${styles.personConnecting}`}>conectando…</span>
    ) : participant.micMuted ? (
      <span className={`${styles.personState} ${styles.personMuted}`}>🔇</span>
    ) : (
      <span className={`${styles.personState} ${styles.personLive}`}>●</span>
    )

  return (
    <li className={styles.person}>
      <span className={styles.personAvatar}>
        {player?.photoURL ? (
          <img src={player.photoURL} alt="" />
        ) : (
          name.slice(0, 2).toUpperCase()
        )}
      </span>
      <span className={styles.personName}>{name}</span>
      {state}
    </li>
  )
}
