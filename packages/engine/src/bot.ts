import {
  HIDDEN_CARD,
  cardSuit,
  isBlindRound,
  rankValue,
  type Card,
  type GameSnapshot,
  type HandCard,
} from '@bridou/shared'
import { createDeck } from './deck'

/**
 * Everything a bot may look at when deciding. Built ONLY from the public
 * game snapshot plus the seat's client perspective — the same information a
 * human player's screen has. On the blind last round the seat's own cards
 * are `HIDDEN_CARD` and `opponentHands` reveals everyone else.
 */
export interface BetView {
  playerId: string
  snapshot: GameSnapshot
  /** The seat's own hand (may be `HIDDEN_CARD` placeholders on the blind round). */
  hand: Card[]
  /** Legal bets right now (never empty when asked to bet). */
  availableBets: number[]
  /** Blind round only: other seats' remaining cards. */
  opponentHands?: Record<string, Card[]>
}

export interface PlayView {
  playerId: string
  snapshot: GameSnapshot
  /** The seat's own hand with unplayable cards disabled (never all disabled when asked to play). */
  playableCards: HandCard[]
  /** Blind round only: other seats' remaining cards. */
  opponentHands?: Record<string, Card[]>
}

export interface BotStrategy {
  decideBet(view: BetView): number
  decideCard(view: PlayView): Card
}

/** Chance [0..1] that a card takes a trick, before seeing any table. */
export const winChance = (
  card: Card,
  trunfoSuit: string,
  numOfPlayers: number,
  cardsPerPlayer: number,
): number => {
  const strength = (rankValue(card) - 2) / 12 // 2 → 0, A → 1
  if (cardSuit(card) === trunfoSuit) {
    return 0.45 + 0.55 * strength
  }
  const cardsAgainst = (numOfPlayers - 1) * cardsPerPlayer
  const trumpRisk = Math.min(0.75, cardsAgainst * 0.035)
  return strength * strength * (1 - trumpRisk)
}

/** Does `card` beat everything on the table so far? (Leading always "wins so far".) */
export const winsSoFar = (
  card: Card,
  playedCards: Card[],
  trunfoSuit: string,
): boolean => {
  if (!playedCards.length) return true
  const ledSuit = cardSuit(playedCards[0]!)
  const best = playedCards.reduce((a, b) => (beats(b, a, ledSuit, trunfoSuit) ? b : a))
  return beats(card, best, ledSuit, trunfoSuit)
}

export const beats = (
  challenger: Card,
  incumbent: Card,
  ledSuit: string,
  trunfoSuit: string,
): boolean => {
  const cSuit = cardSuit(challenger)
  const iSuit = cardSuit(incumbent)
  if (cSuit === trunfoSuit && iSuit !== trunfoSuit) return true
  if (cSuit !== trunfoSuit && iSuit === trunfoSuit) return false
  if (cSuit === iSuit) return rankValue(challenger) > rankValue(incumbent)
  return cSuit === ledSuit && iSuit !== ledSuit
}

/** Legal cards from a hand given the suit already led (null = leading). */
export const legalCards = (hand: readonly Card[], ledSuit: string | null): Card[] => {
  if (!ledSuit) return [...hand]
  const same = hand.filter((c) => cardSuit(c) === ledSuit)
  return same.length ? same : [...hand]
}

/** Snap an ideal bet onto the nearest legal value (ties → lower). */
export const snapBet = (ideal: number, availableBets: number[]): number =>
  availableBets.reduce((best, bet) => {
    const distance = Math.abs(bet - ideal)
    const bestDistance = Math.abs(best - ideal)
    if (distance < bestDistance) return bet
    if (distance === bestDistance && bet < best) return bet
    return best
  })

/**
 * Pick a card the way the heuristic bot would, given an explicit hand and
 * trick context. Used by the heuristic strategy and as the Monte Carlo playout.
 */
export const heuristicPickCard = (args: {
  hand: readonly Card[]
  playedCards: readonly Card[]
  trunfoSuit: string
  numOfPlayers: number
  cardsPerPlayer: number
  bet: number
  made: number
  seatsLeftInTrick: number
}): Card => {
  const playable = legalCards(args.hand, args.playedCards.length ? cardSuit(args.playedCards[0]!) : null)
  if (!playable.length) throw new Error('No legal cards to play')

  const isLastToPlay = args.seatsLeftInTrick === 1
  const wantsTrick = args.made < args.bet
  const power = (card: Card) =>
    winChance(card, args.trunfoSuit, args.numOfPlayers, args.cardsPerPlayer)
  const weakestFirst = [...playable].sort((a, b) => power(a) - power(b))
  const winners = weakestFirst.filter((c) => winsSoFar(c, [...args.playedCards], args.trunfoSuit))
  const losers = weakestFirst.filter((c) => !winners.includes(c))

  if (wantsTrick) {
    if (!winners.length) return weakestFirst[0]!
    return isLastToPlay ? winners[0]! : winners[winners.length - 1]!
  }
  if (losers.length) return losers[losers.length - 1]!
  return isLastToPlay ? winners[winners.length - 1]! : winners[0]!
}

export const heuristicPickBet = (args: {
  hand: readonly Card[]
  trunfoSuit: string
  numOfPlayers: number
  cardsPerPlayer: number
  availableBets: number[]
}): number => {
  const expected = args.hand.reduce(
    (acc, card) =>
      acc + winChance(card, args.trunfoSuit, args.numOfPlayers, args.cardsPerPlayer),
    0,
  )
  return snapBet(Math.round(expected), args.availableBets)
}

/**
 * Blind last round: own card unknown, opponents' cards known. Average the
 * win chance of every card still in the deck, then snap to a legal bet.
 */
export const heuristicPickBlindBet = (args: {
  opponentHands: Record<string, Card[]>
  trunfo: Card
  numOfPlayers: number
  availableBets: number[]
}): number => {
  const known = new Set<Card>([args.trunfo, ...Object.values(args.opponentHands).flat()])
  const pool = createDeck().filter((c) => !known.has(c))
  if (!pool.length) return snapBet(0, args.availableBets)

  const trunfoSuit = cardSuit(args.trunfo)
  const expected =
    pool.reduce((acc, card) => acc + winChance(card, trunfoSuit, args.numOfPlayers, 1), 0) /
    pool.length
  return snapBet(Math.round(expected), args.availableBets)
}

/**
 * A rule-abiding heuristic player. Bets its expected trick count; then plays
 * to land EXACTLY on its bet — hunting tricks while short, ducking once made.
 * On the blind round it never peeks at its own card.
 */
export const createHeuristicBot = (): BotStrategy => ({
  decideBet(view: BetView): number {
    const round = view.snapshot.currentRound
    if (isBlindRound(round.currentRoundNumber)) {
      return heuristicPickBlindBet({
        opponentHands: view.opponentHands ?? {},
        trunfo: round.trunfo,
        numOfPlayers: round.numOfPlayers,
        availableBets: view.availableBets,
      })
    }
    return heuristicPickBet({
      hand: view.hand,
      trunfoSuit: cardSuit(round.trunfo),
      numOfPlayers: round.numOfPlayers,
      cardsPerPlayer: round.cardsForEachPlayer,
      availableBets: view.availableBets,
    })
  },

  decideCard(view: PlayView): Card {
    const { snapshot, playerId, playableCards } = view
    const round = snapshot.currentRound
    const turn = round.currentTurn
    const playable = playableCards.filter((c) => !c.disabled).map((c) => c.value)
    if (!playable.length) throw new Error('Bot was asked to play with no playable cards')

    // Blind round: only the hidden slot is playable — server resolves the real card.
    if (playable.every((c) => c === HIDDEN_CARD)) return HIDDEN_CARD

    const me = round.players.find((p) => p.id === playerId)
    const made = round.whoMade.filter((w) => w.id === playerId).length
    const played = turn?.playedCards ?? []

    return heuristicPickCard({
      hand: playable,
      playedCards: played,
      trunfoSuit: cardSuit(round.trunfo),
      numOfPlayers: round.numOfPlayers,
      cardsPerPlayer: round.cardsForEachPlayer,
      bet: me?.bet ?? 0,
      made,
      seatsLeftInTrick: turn ? turn.players.length - played.length : 1,
    })
  },
})
