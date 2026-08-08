'use client'

/**
 * Dev-only playground for the celebration/pause overlays — fake data,
 * no auth. Note: the round-end overlay has its real 1.6s reveal delay.
 */
import type { RoundPlayer, ScoreboardEntry } from '@bridou/shared'
import { useState } from 'react'
import { AbandonedOverlay } from '@/features/game/components/AbandonedOverlay'
import { RoundEndOverlay } from '@/features/game/components/RoundEndOverlay'
import { ScoreboardOverlay } from '@/features/game/components/ScoreboardOverlay'

const player = (
  name: string,
  bet: number,
  made: number,
  isBot = false,
  tragadas = 0,
): RoundPlayer => ({
  id: name,
  name,
  ...(isBot && { isBot }),
  bet,
  made,
  points: null,
  tragadas,
})

const SCOREBOARD: ScoreboardEntry[] = [
  { id: 'ana', name: 'Ana', totalPoints: 47 },
  { id: 'bot', name: 'Bot Marley', isBot: true, totalPoints: 33 },
  { id: 'rafa', name: 'Rafa', totalPoints: 21 },
  { id: 'carol', name: 'Carol', totalPoints: -2 },
]

type Moment =
  | 'none'
  | 'bailou'
  | 'bailaram'
  | 'ninguem'
  | 'brisa'
  | 'cachimbo'
  | 'placar'
  | 'fim'
  | 'pausada'

export default function MomentsDevPage() {
  const [moment, setMoment] = useState<Moment>('none')

  const moments: { key: Moment; label: string }[] = [
    { key: 'bailou', label: 'Bailou (1)' },
    { key: 'bailaram', label: 'Bailaram (2)' },
    { key: 'ninguem', label: 'Ninguém bailou' },
    { key: 'brisa', label: 'Baseado pagou' },
    { key: 'cachimbo', label: 'Baseado cobrou' },
    { key: 'placar', label: 'Placar (meio)' },
    { key: 'fim', label: 'Fim de jogo' },
    { key: 'pausada', label: 'Pausada' },
    { key: 'none', label: 'Fechar' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '1rem' }}>
      <h1>Momentos</h1>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {moments.map(({ key, label }) => (
          <button key={key} className="btn" onClick={() => setMoment(key)}>
            {label}
          </button>
        ))}
      </div>
      <p className="hint" style={{ textAlign: 'left' }}>
        O overlay de fim de rodada aparece após 1,6s (tempo da última feita).
      </p>

      {moment === 'bailou' && (
        <RoundEndOverlay
          key="1"
          playerId="Carol"
          result={{ round: 5, bailadores: [player('Carol', 2, 0)] }}
        />
      )}
      {moment === 'bailaram' && (
        <RoundEndOverlay
          key="2"
          playerId="Ana"
          result={{
            round: 7,
            bailadores: [player('Rafa', 1, 3), player('Bot Marley', 0, 1, true)],
          }}
        />
      )}
      {moment === 'ninguem' && (
        <RoundEndOverlay key="3" playerId="Ana" result={{ round: 4, bailadores: [] }} />
      )}
      {/* the baseado's two faces: three tragadas on a made bet, and the same
          blunt nursed through a whole round that ended in a bailada */}
      {moment === 'brisa' && (
        <RoundEndOverlay
          key="4"
          playerId="Ana"
          result={{
            round: 6,
            bailadores: [],
            players: [player('Ana', 2, 2, false, 3), player('Rafa', 1, 1)],
          }}
        />
      )}
      {moment === 'cachimbo' && (
        <RoundEndOverlay
          key="5"
          playerId="Ana"
          result={{
            round: 7,
            bailadores: [player('Ana', 3, 1, false, 6)],
            players: [player('Ana', 3, 1, false, 6), player('Rafa', 2, 2)],
          }}
        />
      )}
      {moment === 'placar' && (
        <ScoreboardOverlay scoreboard={SCOREBOARD} onClose={() => setMoment('none')} />
      )}
      {moment === 'fim' && <ScoreboardOverlay scoreboard={SCOREBOARD} final />}
      {moment === 'pausada' && (
        <AbandonedOverlay
          seats={[{ playerId: 'carol', resumeAt: Date.now() + 23_000 }]}
          players={[player('Carol', 1, 0)]}
        />
      )}
    </div>
  )
}
