'use client'

import type { RoundPlayer } from '@bridou/shared'

export function BailadoresOverlay({ bailadores }: { bailadores: RoundPlayer[] }) {
  return (
    <div className="overlay">
      <div className="overlay-panel bailou">
        <h2>{bailadores.length ? 'Bailou! 💃' : 'Ninguém bailou! 🎉'}</h2>
        <ul className="score-list">
          {bailadores.map((player) => (
            <li key={player.id} className="score-row">
              {player.photoURL && <img className="avatar" src={player.photoURL} alt="" />}
              <span className="score-name">{player.name}</span>
              <span className="score-points">
                pediu {player.bet} · fez {player.made}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
