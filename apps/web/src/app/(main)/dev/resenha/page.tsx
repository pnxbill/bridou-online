'use client'

import type { GameRecap, PlayerInfo } from '@bridou/shared'
import { useMemo } from 'react'
import { PointsChart } from '@/features/recap/PointsChart'
import { colorsByPlayer } from '@/features/recap/series-colors'

/**
 * Design fixture for the resenha's chart — drives the real component with a
 * scripted 13-round game, so the turning-point graph can be iterated on
 * without finishing a live match.
 */

const PLAYERS: PlayerInfo[] = [
  { id: 'ana', name: 'Ana Prado' },
  { id: 'bru', name: 'Bruno Salles' },
  { id: 'cai', name: 'Caio Ferraz' },
  { id: 'dan', name: 'Daniela Reis' },
]

/** Per-round points, hand-picked so the lead actually changes three times. */
const ROUND_POINTS: Record<string, number[]> = {
  ana: [11, -1, 12, 10, -1, 13, 11, -1, 10, 12, -1, 11, 11],
  bru: [10, 12, -1, 11, 13, -1, 10, 12, 11, -1, 13, 10, -1],
  cai: [-1, 11, 10, -1, 12, 11, -1, 13, 12, 11, 10, -1, 12],
  dan: [12, 10, 11, 12, -1, 10, 13, 11, -1, 10, 12, 13, 10],
}

const buildRecap = (): GameRecap => {
  const totals: Record<string, number> = { ana: 0, bru: 0, cai: 0, dan: 0 }
  const progression = Array.from({ length: 13 }, (_, i) => {
    for (const id of Object.keys(totals)) {
      totals[id] = (totals[id] ?? 0) + (ROUND_POINTS[id]?.[i] ?? 0)
    }
    return { roundNumber: i + 1, totals: { ...totals } }
  })

  const finalScoreboard = PLAYERS.map((p) => ({
    ...p,
    totalPoints: totals[p.id] ?? 0,
  })).sort((a, b) => b.totalPoints - a.totalPoints)

  return {
    gameId: 'dev-recap',
    playedAt: new Date().toISOString(),
    durationMs: 41 * 60 * 1000,
    players: PLAYERS,
    finalScoreboard,
    awards: [],
    progression,
    unlocks: [],
    biggestComeback: null,
    ranked: true,
  }
}

export default function DevResenhaPage() {
  const recap = useMemo(buildRecap, [])
  const colors = useMemo(() => colorsByPlayer(recap.players.map((p) => p.id)), [recap])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>/dev/resenha — gráfico da virada</h1>
      <PointsChart players={recap.players} progression={recap.progression} colors={colors} />
      <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
        Passe o mouse (ou o dedo) pelo gráfico para ver o placar de cada rodada.
      </p>
    </div>
  )
}
