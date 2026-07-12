import {
  cardSuit,
  rankValue,
  type Card,
  type RoundSnapshot,
} from '@bridou/shared'
import {
  heuristicPickBet,
  heuristicPickCard,
  type BetView,
  type BotStrategy,
  type PlayView,
} from './bot'
import { createDeck, shuffle } from './deck'
import type { Rng } from './ports'

export interface MonteCarloOptions {
  /** Hidden-hand samples per decision. Higher = stronger / slower. */
  samples?: number
  /** Injected for deterministic tests; defaults to Math.random. */
  rng?: Rng
}

interface SimSeat {
  id: string
  hand: Card[]
  bet: number
  made: number
}

/** Bridou scoring for one round: exact bet → 10 + tricks, else −1. */
const roundPoints = (bet: number, made: number): number =>
  bet === made ? 10 + made : -1

const allPlayedCards = (round: RoundSnapshot): Card[] => [
  ...round.turns.flatMap((t) => t.playedCards),
  ...(round.currentTurn?.playedCards ?? []),
]

/** How many cards each seat still holds, from public info + our hand size. */
const handSizes = (
  round: RoundSnapshot,
  myId: string,
  myHandSize: number,
): Map<string, number> => {
  const completed = round.whoMade.length
  const sizes = new Map<string, number>()
  for (const p of round.players) {
    if (p.id === myId) {
      sizes.set(p.id, myHandSize)
      continue
    }
    let size = round.cardsForEachPlayer - completed
    const turn = round.currentTurn
    if (turn) {
      const idx = turn.players.findIndex((s) => s.id === p.id)
      if (idx >= 0 && idx < turn.playedCards.length) size -= 1
    }
    sizes.set(p.id, Math.max(0, size))
  }
  return sizes
}

/**
 * Deal unknown cards into opponent hands. Candidate pool = full deck minus
 * our hand, cards already played, and the face-up trunfo. Leftover cards are
 * the undealt stock and stay out of every hand.
 */
const sampleOpponentHands = (
  round: RoundSnapshot,
  myId: string,
  myHand: readonly Card[],
  rng: Rng,
): Map<string, Card[]> => {
  const sizes = handSizes(round, myId, myHand.length)
  const known = new Set<Card>([...myHand, ...allPlayedCards(round), round.trunfo])
  const pool = shuffle(
    createDeck().filter((c) => !known.has(c)),
    rng,
  )

  const hands = new Map<string, Card[]>()
  hands.set(myId, [...myHand])
  let offset = 0
  for (const p of round.players) {
    if (p.id === myId) continue
    const n = sizes.get(p.id) ?? 0
    hands.set(p.id, pool.slice(offset, offset + n))
    offset += n
  }
  return hands
}

/**
 * Blind last round: opponents' cards are known; sample OUR hidden card from
 * the remaining deck. Same information asymmetry humans get.
 */
const sampleOwnHandBlind = (
  round: RoundSnapshot,
  myId: string,
  opponentHands: Record<string, Card[]>,
  rng: Rng,
): Map<string, Card[]> => {
  const known = new Set<Card>([
    ...Object.values(opponentHands).flat(),
    ...allPlayedCards(round),
    round.trunfo,
  ])
  const pool = shuffle(
    createDeck().filter((c) => !known.has(c)),
    rng,
  )
  const mySize = handSizes(round, myId, 1).get(myId) ?? 1
  const hands = new Map<string, Card[]>()
  hands.set(myId, pool.slice(0, mySize))
  for (const p of round.players) {
    if (p.id === myId) continue
    hands.set(p.id, [...(opponentHands[p.id] ?? [])])
  }
  return hands
}

/** Pick the right sampler: normal (hide opponents) vs blind (hide self). */
const sampleHiddenCards = (
  round: RoundSnapshot,
  myId: string,
  myHand: readonly Card[],
  opponentHands: Record<string, Card[]> | undefined,
  rng: Rng,
): Map<string, Card[]> => {
  if (opponentHands && Object.keys(opponentHands).length > 0) {
    return sampleOwnHandBlind(round, myId, opponentHands, rng)
  }
  return sampleOpponentHands(round, myId, myHand, rng)
}

const trickWinnerId = (
  order: string[],
  played: Card[],
  trunfoSuit: string,
): string => {
  const ledSuit = cardSuit(played[0]!)
  const hasTrunfo = played.some((c) => cardSuit(c) === trunfoSuit)
  let bestIdx = 0
  for (let i = 1; i < played.length; i++) {
    const card = played[i]!
    const best = played[bestIdx]!
    if (hasTrunfo) {
      const cardTrump = cardSuit(card) === trunfoSuit
      const bestTrump = cardSuit(best) === trunfoSuit
      if (cardTrump && !bestTrump) bestIdx = i
      else if (cardTrump && bestTrump && rankValue(card) > rankValue(best)) bestIdx = i
    } else if (cardSuit(card) === ledSuit && rankValue(card) > rankValue(best)) {
      bestIdx = i
    }
  }
  return order[bestIdx]!
}

/** Rotate so `leaderId` leads; returns play order for the trick. */
const playOrder = (seatIds: string[], leaderId: string): string[] => {
  const start = seatIds.indexOf(leaderId)
  if (start < 0) return [...seatIds]
  return [...seatIds.slice(start), ...seatIds.slice(0, start)]
}

/**
 * Finish the current trick (if any) and play out the rest of the round with
 * the heuristic policy. Mutates `seats` in place. Returns our round points.
 */
const playoutRound = (
  seats: SimSeat[],
  myId: string,
  trunfoSuit: string,
  cardsPerPlayer: number,
  current: { order: string[]; played: Card[] } | null,
  leaderId: string,
): number => {
  const byId = new Map(seats.map((s) => [s.id, s]))
  const seatIds = seats.map((s) => s.id)
  let order = current?.order ?? playOrder(seatIds, leaderId)
  let played = current ? [...current.played] : []

  const playOne = (seat: SimSeat, table: Card[]): Card => {
    const card = heuristicPickCard({
      hand: seat.hand,
      playedCards: table,
      trunfoSuit,
      numOfPlayers: seats.length,
      cardsPerPlayer,
      bet: seat.bet,
      made: seat.made,
      seatsLeftInTrick: order.length - table.length,
    })
    seat.hand = seat.hand.filter((c) => c !== card)
    return card
  }

  const finishTrick = () => {
    while (played.length < order.length) {
      const seat = byId.get(order[played.length]!)!
      played.push(playOne(seat, played))
    }
    const winnerId = trickWinnerId(order, played, trunfoSuit)
    byId.get(winnerId)!.made++
    leaderId = winnerId
    order = playOrder(seatIds, leaderId)
    played = []
  }

  if (current && played.length) finishTrick()

  // Remaining tricks until hands are empty
  while ((byId.get(myId)?.hand.length ?? 0) > 0) {
    finishTrick()
  }

  const me = byId.get(myId)!
  return roundPoints(me.bet, me.made)
}

const madeSoFar = (round: RoundSnapshot): Map<string, number> => {
  const counts = new Map<string, number>()
  for (const p of round.players) counts.set(p.id, 0)
  for (const w of round.whoMade) {
    counts.set(w.id, (counts.get(w.id) ?? 0) + 1)
  }
  return counts
}

/**
 * Monte Carlo bot: samples legal deals of the hidden cards, plays each out
 * with the heuristic policy, and picks the bet/card with the best average
 * Bridou round score. Uses the same view as a human: own hand (or hidden on
 * the blind round) + public snapshot + revealed opponent hands when blind.
 */
export const createMonteCarloBot = (options: MonteCarloOptions = {}): BotStrategy => {
  const samples = options.samples ?? 100
  const rng = options.rng ?? Math.random

  return {
    decideBet(view: BetView): number {
      const { snapshot, playerId, hand, availableBets, opponentHands } = view
      const round = snapshot.currentRound
      const trunfoSuit = cardSuit(round.trunfo)
      const scores = new Map<number, number>(availableBets.map((b) => [b, 0]))

      for (let i = 0; i < samples; i++) {
        const hands = sampleHiddenCards(round, playerId, hand, opponentHands, rng)
        for (const bet of availableBets) {
          const seats: SimSeat[] = round.players.map((p) => ({
            id: p.id,
            hand: [...(hands.get(p.id) ?? [])],
            bet:
              p.id === playerId
                ? bet
                : (p.bet ??
                  heuristicPickBet({
                    hand: hands.get(p.id) ?? [],
                    trunfoSuit,
                    numOfPlayers: round.numOfPlayers,
                    cardsPerPlayer: round.cardsForEachPlayer,
                    availableBets: Array.from(
                      { length: round.cardsForEachPlayer + 1 },
                      (_, n) => n,
                    ),
                  })),
            made: 0,
          }))
          const points = playoutRound(
            seats,
            playerId,
            trunfoSuit,
            round.cardsForEachPlayer,
            null,
            round.players[0]!.id,
          )
          scores.set(bet, (scores.get(bet) ?? 0) + points)
        }
      }

      let best = availableBets[0]!
      for (const bet of availableBets) {
        if ((scores.get(bet) ?? 0) > (scores.get(best) ?? 0)) best = bet
      }
      return best
    },

    decideCard(view: PlayView): Card {
      const { snapshot, playerId, playableCards, opponentHands } = view
      const round = snapshot.currentRound
      const turn = round.currentTurn
      const playable = playableCards.filter((c) => !c.disabled).map((c) => c.value)
      if (!playable.length) throw new Error('Bot was asked to play with no playable cards')

      // Single legal card — no need to sample (includes blind `HIDDEN_CARD`)
      if (playable.length === 1) return playable[0]!

      const trunfoSuit = cardSuit(round.trunfo)
      const me = round.players.find((p) => p.id === playerId)
      const myBet = me?.bet ?? 0
      const mades = madeSoFar(round)
      const order = turn?.players.map((p) => p.id) ?? round.players.map((p) => p.id)
      const alreadyPlayed = turn?.playedCards ?? []
      const scores = new Map<Card, number>(playable.map((c) => [c, 0]))
      const myHand = playableCards.map((c) => c.value)

      for (let i = 0; i < samples; i++) {
        const hands = sampleHiddenCards(round, playerId, myHand, opponentHands, rng)

        for (const card of playable) {
          // Rebuild seats from this sample; apply our candidate card first
          const seats: SimSeat[] = round.players.map((p) => ({
            id: p.id,
            hand: [...(hands.get(p.id) ?? [])],
            bet: p.bet ?? 0,
            made: mades.get(p.id) ?? 0,
          }))
          const mine = seats.find((s) => s.id === playerId)!
          mine.bet = myBet
          mine.hand = mine.hand.filter((c) => c !== card)

          const table = [...alreadyPlayed, card]
          const points = playoutRound(
            seats,
            playerId,
            trunfoSuit,
            round.cardsForEachPlayer,
            { order, played: table },
            order[0]!,
          )
          scores.set(card, (scores.get(card) ?? 0) + points)
        }
      }

      let best = playable[0]!
      for (const card of playable) {
        if ((scores.get(card) ?? 0) > (scores.get(best) ?? 0)) best = card
      }
      return best
    },
  }
}
