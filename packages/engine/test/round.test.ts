import { describe, expect, it, vi } from 'vitest'
import { Round, cardsForRound } from '../src/round'
import type { RoundPlayerState } from '../src/player'
import {
  ManualScheduler,
  RecordingPublisher,
  drivePendingRequests,
  makeRoundPlayer,
  seededRng,
} from './helpers'

const makeRound = ({ roundNumber = 3, playerCount = 3, seed = 1 } = {}) => {
  const publisher = new RecordingPublisher()
  const scheduler = new ManualScheduler()
  const onComplete = vi.fn()
  const players: RoundPlayerState[] = Array.from({ length: playerCount }, (_, i) =>
    makeRoundPlayer(`p${i + 1}`, []),
  )
  const round = new Round(
    { roundNumber, players },
    { publisher, rng: seededRng(seed), scheduler, onComplete },
  )
  return { round, publisher, scheduler, onComplete, players }
}

describe('cardsForRound', () => {
  it('deals 1→7 then 6→1 across the 13 rounds', () => {
    const expected = [1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1]
    expected.forEach((cards, i) => expect(cardsForRound(i + 1)).toBe(cards))
  })
})

describe('start', () => {
  it('deals the right number of distinct cards and a trunfo outside all hands', () => {
    const { round, players } = makeRound({ roundNumber: 5, playerCount: 4 })
    round.start()

    const allCards = players.flatMap((p) => p.cards)
    expect(players.every((p) => p.cards.length === 5)).toBe(true)
    expect(new Set(allCards).size).toBe(20)
    expect(round.trunfo).not.toBe('')
    expect(allCards).not.toContain(round.trunfo)
  })

  it('announces the round, the trunfo, each hand privately, then asks the first bet', () => {
    const { round, publisher } = makeRound({ playerCount: 3 })
    round.start()

    expect(publisher.events.map((e) => e.type)).toEqual([
      'round-started',
      'trunfo-set',
      'cards-dealt',
      'cards-dealt',
      'cards-dealt',
      'bet-requested',
    ])
    expect(publisher.last('bet-requested')?.playerId).toBe('p1')
    expect(publisher.last('trunfo-set')?.trunfo).toBe(round.trunfo)
  })

  it('deals each player their own hand in the private events', () => {
    const { round, publisher, players } = makeRound()
    round.start()
    publisher.ofType('cards-dealt').forEach((event) => {
      const player = players.find((p) => p.id === event.playerId)
      expect(event.cards).toEqual(player?.cards)
    })
  })

  it('never leaks hands in the round-started snapshot', () => {
    const { round, publisher } = makeRound()
    round.start()
    const snapshot = publisher.last('round-started')!.round
    snapshot.players.forEach((player) => expect(player).not.toHaveProperty('cards'))
  })
})

describe('blind last round', () => {
  it('hides each player\'s own card and reveals everyone else\'s', () => {
    const { round, publisher, players } = makeRound({ roundNumber: 13, playerCount: 3 })
    round.start()

    expect(round.isBlind).toBe(true)
    expect(players.every((p) => p.cards.length === 1)).toBe(true)

    const dealt = publisher.ofType('cards-dealt')
    expect(dealt).toHaveLength(3)
    dealt.forEach((event) => {
      expect(event.cards).toEqual(['hidden'])
    })

    const reveals = publisher.ofType('opponent-hands')
    expect(reveals).toHaveLength(3)
    for (const event of reveals) {
      const others = players.filter((p) => p.id !== event.playerId)
      expect(Object.keys(event.hands).sort()).toEqual(others.map((p) => p.id).sort())
      for (const other of others) {
        expect(event.hands[other.id]).toEqual(other.cards)
      }
      expect(event.hands[event.playerId]).toBeUndefined()
    }
  })

  it('resolves a HIDDEN_CARD play to the player\'s real card', () => {
    const { round, publisher, players } = makeRound({ roundNumber: 13, playerCount: 2 })
    round.start()
    round.placeBet('p1', 0)
    round.placeBet('p2', 0)

    const real = players[0]!.cards[0]!
    round.playCard('p1', 'hidden')
    expect(publisher.last('card-played')).toMatchObject({
      playerId: 'p1',
      card: real,
    })
    expect(players[0]!.cards).toEqual([])
  })

  it('does not emit opponent-hands on normal 1-card round 1', () => {
    const { round, publisher } = makeRound({ roundNumber: 1, playerCount: 3 })
    round.start()
    expect(publisher.ofType('opponent-hands')).toHaveLength(0)
    publisher.ofType('cards-dealt').forEach((event) => {
      expect(event.cards[0]).not.toBe('hidden')
    })
  })
})

describe('betting', () => {
  it('offers 0..cards to everyone except the last bettor', () => {
    const { round } = makeRound({ roundNumber: 3, playerCount: 3 })
    round.start()
    expect(round.getAvailableBets('p1')).toEqual([0, 1, 2, 3])
  })

  it('returns nothing for a player out of turn', () => {
    const { round } = makeRound()
    round.start()
    expect(round.getAvailableBets('p2')).toEqual([])
  })

  it('forbids the last bettor from making bets sum to the card count', () => {
    const { round } = makeRound({ roundNumber: 3, playerCount: 3 })
    round.start()
    round.placeBet('p1', 1)
    round.placeBet('p2', 1)
    // 3 cards, 2 already bet: p3 cannot bet 1
    expect(round.getAvailableBets('p3')).toEqual([0, 2, 3])
    expect(() => round.placeBet('p3', 1)).toThrow("Can't bet this value")
  })

  it('exempts 1-card rounds from the last-bettor restriction', () => {
    const { round } = makeRound({ roundNumber: 1, playerCount: 3 })
    round.start()
    round.placeBet('p1', 0)
    round.placeBet('p2', 1)
    expect(round.getAvailableBets('p3')).toEqual([0, 1])
    expect(() => round.placeBet('p3', 0)).not.toThrow()
  })

  it('rejects bets out of range and out of turn', () => {
    const { round } = makeRound({ roundNumber: 3 })
    round.start()
    expect(() => round.placeBet('p2', 1)).toThrow('Not your turn')
    expect(() => round.placeBet('p1', 4)).toThrow("Can't bet this value")
    expect(() => round.placeBet('p1', -1)).toThrow("Can't bet this value")
  })

  it('broadcasts each bet and asks the next player', () => {
    const { round, publisher } = makeRound()
    round.start()
    round.placeBet('p1', 2)
    expect(publisher.last('player-bet')).toEqual({ type: 'player-bet', playerId: 'p1', bet: 2 })
    expect(publisher.last('bet-requested')?.playerId).toBe('p2')
  })

  it('starts the first trick after the last bet, led by the first bettor', () => {
    const { round, publisher } = makeRound({ roundNumber: 3, playerCount: 3 })
    round.start()
    round.placeBet('p1', 0)
    round.placeBet('p2', 0)
    round.placeBet('p3', 2)

    expect(round.betting).toBe(false)
    expect(publisher.last('turn-started')?.turn.players[0]?.id).toBe('p1')
    expect(publisher.last('play-requested')?.playerId).toBe('p1')
    expect(() => round.placeBet('p1', 1)).toThrow("Can't bet while still playing")
  })

  it('rejects playing a card while betting', () => {
    const { round } = makeRound()
    round.start()
    expect(() => round.playCard('p1', 'A-♠️')).toThrow('No turn in progress')
  })
})

describe('a full round', () => {
  const playRound = (seed: number, roundNumber = 3, playerCount = 3) => {
    const { round, publisher, scheduler, onComplete, players } = makeRound({
      roundNumber,
      playerCount,
      seed,
    })
    const rng = seededRng(seed + 1000)
    const cursor = { index: 0 }
    round.start()
    // tricks are separated by a scheduled resolution pause — flush through them
    let guard = 30
    while (true) {
      if (--guard === 0) throw new Error('round never finished')
      drivePendingRequests(round, publisher, rng, cursor)
      if (!scheduler.pending.length) break
      scheduler.flush()
    }
    return { round, publisher, onComplete, players }
  }

  it('completes with one trick per card and calls onComplete once', () => {
    const { round, publisher, onComplete } = playRound(7)
    expect(round.turns).toHaveLength(3)
    expect(publisher.ofType('turn-ended')).toHaveLength(3)
    expect(publisher.ofType('round-ended')).toHaveLength(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('gives 10 + tricks to exact bets and -1 to the rest', () => {
    const { players } = playRound(7)
    players.forEach((player) => {
      expect(player.made).not.toBeNull()
      if (player.bet === player.made) expect(player.points).toBe(10 + player.made!)
      else expect(player.points).toBe(-1)
    })
  })

  it('total tricks made equals the number of cards dealt', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { players, round } = playRound(seed, 5, 4)
      const totalMade = players.reduce((acc, p) => acc + (p.made ?? 0), 0)
      expect(totalMade).toBe(round.cardsForEachPlayer)
    }
  })

  it('reports players who missed their bet as bailadores', () => {
    const { round, publisher, players } = playRound(7)
    const missed = players.filter((p) => p.points === -1).map((p) => p.id)
    expect(round.bailadores.map((b) => b.id)).toEqual(missed)
    expect(publisher.last('round-ended')?.bailadores.map((b) => b.id)).toEqual(missed)
  })

  it('announces the trick winner and pauses before the next trick starts', () => {
    const { round, publisher, scheduler } = makeRound({ roundNumber: 2, playerCount: 2 })
    const rng = seededRng(42)
    const cursor = { index: 0 }
    round.start()
    drivePendingRequests(round, publisher, rng, cursor)

    // first trick is complete; the winner is announced…
    const ended = publisher.ofType('turn-ended')
    expect(ended).toHaveLength(1)
    expect(ended[0]!.winnerId).toBe(round.whoMade[0]!.id)

    // …but the next trick waits for the resolution pause
    expect(publisher.ofType('turn-started')).toHaveLength(1)
    expect(scheduler.pending).toHaveLength(1)
    scheduler.flush()
    expect(publisher.ofType('turn-started')).toHaveLength(2)
  })

  it('lets the winner of a trick lead the next one', () => {
    const { round, publisher } = playRound(11, 4, 3)
    const turnLeaders = publisher.ofType('turn-started').map((e) => e.turn.players[0]!.id)

    expect(turnLeaders).toHaveLength(round.cardsForEachPlayer)
    round.whoMade.slice(0, -1).forEach((winner, i) => {
      expect(turnLeaders[i + 1]).toBe(winner.id)
    })
  })

  it('empties every hand by the end of the round', () => {
    const { players } = playRound(3, 6, 4)
    players.forEach((player) => expect(player.cards).toHaveLength(0))
  })
})
