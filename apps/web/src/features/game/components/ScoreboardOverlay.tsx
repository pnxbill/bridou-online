'use client'

import type { ScoreboardEntry } from '@bridou/shared'

interface Props {
  scoreboard: ScoreboardEntry[]
  onClose?: () => void
}

export function ScoreboardOverlay({ scoreboard, onClose }: Props) {
  return (
    <div className="overlay">
      <div className="overlay-panel">
        <h2>Placar</h2>
        <ol className="score-list">
          {scoreboard.map((entry) => (
            <li key={entry.id} className="score-row">
              {entry.photoURL && <img className="avatar" src={entry.photoURL} alt="" />}
              <span className="score-name">{entry.name}</span>
              <span className="score-points">{entry.totalPoints}</span>
            </li>
          ))}
        </ol>
        {onClose && (
          <button className="btn" onClick={onClose}>
            Fechar
          </button>
        )}
      </div>
    </div>
  )
}
