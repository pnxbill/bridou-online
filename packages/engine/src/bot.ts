import {
  cardSuit,
  rankValue,
  type Card,
  type GameSnapshot,
  type HandCard,
} from '@bridou/shared'

/**
 * Everything a bot may look at when deciding. Built ONLY from the public
 * game snapshot plus the seat's own perspective — the same information a
 * human player's screen has. Other players' hands are structurally absent
 * from these types, so a strategy cannot cheat.
 */
export interface BetView {
  playerId: string
  snapshot: GameSnapshot
  /** The seat's own hand. */
  hand: Card[]
  /** Legal bets right now (never empty when asked to bet). */
  availableBets: number[]
}

export interface PlayView {
  playerId: string
  snapshot: GameSnapshot
  /** The seat's own hand with unplayable cards disabled (never all disabled when asked to play). */
  playableCards: HandCard[]
}

export interface BotStrategy {
  decideBet(view: BetView): number
  decideCard(view: PlayView): Card
}

/** Chance [0..1] that a card takes a trick, before seeing any table. */
const winChance = (
  card: Card,
  trunfoSuit: string,
  numOfPlayers: number,
  cardsForEachPlayer: number,
): number => {
  const strength = (rankValue(card) - 2) / 12 // 2 → 0, A → 1
  if (cardSuit(card) === trunfoSuit) {
    // Any trunfo is live; high trunfos are near-certain tricks
    return 0.45 + 0.55 * strength
  }
  // Off-suit cards must be top of their suit AND survive trumping; the more
  // cards other players hold, the likelier someone is void and trumps.
  const cardsAgainst = (numOfPlayers - 1) * cardsForEachPlayer
  const trumpRisk = Math.min(0.75, cardsAgainst * 0.035)
  return strength * strength * (1 - trumpRisk)
}

/** Does `card` beat everything on the table so far? (Leading always "wins so far".) */
const winsSoFar = (card: Card, playedCards: Card[], trunfoSuit: string): boolean => {
  if (!playedCards.length) return true
  const ledSuit = cardSuit(playedCards[0]!)

  const best = playedCards.reduce((a, b) => (beats(b, a, ledSuit, trunfoSuit) ? b : a))
  return beats(card, best, ledSuit, trunfoSuit)
}

const beats = (challenger: Card, incumbent: Card, ledSuit: string, trunfoSuit: string): boolean => {
  const cSuit = cardSuit(challenger)
  const iSuit = cardSuit(incumbent)
  if (cSuit === trunfoSuit && iSuit !== trunfoSuit) return true
  if (cSuit !== trunfoSuit && iSuit === trunfoSuit) return false
  if (cSuit === iSuit) return rankValue(challenger) > rankValue(incumbent)
  // Neither is trunfo and suits differ: only the led suit can be winning
  return cSuit === ledSuit && iSuit !== ledSuit
}

/**
 * A rule-abiding heuristic player. Bets its expected trick count; then plays
 * to land EXACTLY on its bet — hunting tricks while short (winning as cheaply
 * as possible when last to act), ducking once the bet is made and shedding
 * its most dangerous cards while doing so.
 */
export const createHeuristicBot = (): BotStrategy => ({
  decideBet(view: BetView): number {
    const { snapshot, hand, availableBets } = view
    const round = snapshot.currentRound
    const trunfoSuit = cardSuit(round.trunfo)

    const expected = hand.reduce(
      (acc, card) => acc + winChance(card, trunfoSuit, round.numOfPlayers, round.cardsForEachPlayer),
      0,
    )
    const ideal = Math.round(expected)

    // Snap to the nearest legal bet (the last bettor may have one forbidden value)
    return availableBets.reduce((best, bet) => {
      const distance = Math.abs(bet - ideal)
      const bestDistance = Math.abs(best - ideal)
      if (distance < bestDistance) return bet
      if (distance === bestDistance && bet < best) return bet // tie → safer, lower bet
      return best
    })
  },

  decideCard(view: PlayView): Card {
    const { snapshot, playerId, playableCards } = view
    const round = snapshot.currentRound
    const turn = round.currentTurn
    const playable = playableCards.filter((c) => !c.disabled).map((c) => c.value)
    if (!playable.length) throw new Error('Bot was asked to play with no playable cards')

    const trunfoSuit = cardSuit(round.trunfo)
    const played = turn?.playedCards ?? []
    const isLastToPlay = !!turn && played.length === turn.players.length - 1

    const me = round.players.find((p) => p.id === playerId)
    const made = round.whoMade.filter((w) => w.id === playerId).length
    const wantsTrick = made < (me?.bet ?? 0)

    // "Power" orders cards by how likely they are to take tricks later
    const power = (card: Card) =>
      winChance(card, trunfoSuit, round.numOfPlayers, round.cardsForEachPlayer)
    const weakestFirst = [...playable].sort((a, b) => power(a) - power(b))

    const winners = weakestFirst.filter((c) => winsSoFar(c, played, trunfoSuit))
    const losers = weakestFirst.filter((c) => !winners.includes(c))

    if (wantsTrick) {
      if (!winners.length) return weakestFirst[0]! // can't win: dump the weakest
      // Last to act sees the whole trick: take it with the cheapest winner.
      // Earlier, play the strongest card so it survives the players behind.
      return isLastToPlay ? winners[0]! : winners[winners.length - 1]!
    }

    // Bet already made: duck. A card that doesn't beat the table can never
    // win the trick, so shed the most dangerous safe card.
    if (losers.length) return losers[losers.length - 1]!
    // Forced to win so far: if last, the trick is ours anyway — dump the
    // biggest threat; otherwise play the weakest winner and hope to be beaten.
    return isLastToPlay ? winners[winners.length - 1]! : winners[0]!
  },
})
