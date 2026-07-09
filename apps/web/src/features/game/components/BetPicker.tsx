'use client'

interface Props {
  bets: number[]
  onBet: (bet: number) => void
}

export function BetPicker({ bets, onBet }: Props) {
  if (!bets.length) return null

  return (
    <div className="bet-picker">
      <span>Quantas você faz?</span>
      <div className="bet-options">
        {bets.map((bet) => (
          <button key={bet} className="btn bet-btn" onClick={() => onBet(bet)}>
            {bet}
          </button>
        ))}
      </div>
    </div>
  )
}
