import { describe, expect, it } from 'vitest'
import { TOTAL_ROUNDS } from '@bridou/shared'
import { Game } from '../src/game'
import {
  ManualScheduler,
  RecordingPublisher,
  drivePendingRequests,
  makePlayers,
  playFullGame,
  seededRng,
} from './helpers'

const makeGame = ({ playerCount = 4, seed = 1 } = {}) => {
  const publisher = new RecordingPublisher()
  const scheduler = new ManualScheduler()
  const rng = seededRng(seed)
  const players = makePlayers(playerCount)
  const game = new Game(
    { id: 'game-1', leaderId: players[0]!.id, players },
    { publisher, scheduler, rng },
  )
  return { game, publisher, scheduler, rng }
}

describe('setup', () => {
  it('requires at least 2 players', () => {
    expect(() => makeGame({ playerCount: 1 })).toThrow('Required at least 2 players')
  })

  it('caps the table at 7 players (the deck runs out beyond that)', () => {
    expect(() => makeGame({ playerCount: 8 })).toThrow('Maximum of 7 players')
  })

  it('cannot start twice', () => {
    const { game } = makeGame()
    game.start()
    expect(() => game.start()).toThrow('Game already started')
  })

  it('waits between rounds proportionally to the player count', () => {
    const { game, publisher, scheduler, rng } = makeGame({ playerCount: 4 })
    game.start()
    drivePendingRequests(game, publisher, rng)
    expect(scheduler.pending).toHaveLength(1)
    expect(scheduler.pending[0]!.delayMs).toBe(3500 + 4 * 500)
  })

  it('marks the snapshot finished only after the last round', () => {
    const { game, publisher, scheduler, rng } = makeGame({ playerCount: 3 })
    game.start()
    expect(game.snapshot().finished).toBe(false)

    const cursor = { index: 0 }
    let guard = 200
    while (true) {
      if (--guard === 0) throw new Error('game never finished')
      drivePendingRequests(game, publisher, rng, cursor)
      if (!scheduler.pending.length) break
      scheduler.flush()
    }
    expect(game.snapshot().finished).toBe(true)
  })
})

describe('a full game', () => {
  const finished = ({ playerCount = 4, seed = 1 } = {}) => {
    const context = makeGame({ playerCount, seed })
    playFullGame(context.game, context.publisher, context.scheduler, context.rng)
    return context
  }

  it('plays 13 rounds and ends exactly once', () => {
    const { game, publisher } = finished()
    expect(publisher.ofType('round-started')).toHaveLength(TOTAL_ROUNDS)
    expect(publisher.ofType('game-ended')).toHaveLength(1)
    expect(game.rounds).toHaveLength(TOTAL_ROUNDS)
  })

  it('rotates the first bettor one seat every round', () => {
    const { publisher } = finished({ playerCount: 4 })
    const firstBettors = publisher.ofType('round-started').map((e) => e.round.players[0]!.id)
    const expected = Array.from({ length: TOTAL_ROUNDS }, (_, i) => `p${(i % 4) + 1}`)
    expect(firstBettors).toEqual(expected)
  })

  it('scores every round as exact-bet (10 + made) or miss (-1)', () => {
    const { game } = finished({ seed: 3 })
    game.rounds.forEach((round) => {
      round.players.forEach((player) => {
        const expected = player.bet === player.made ? 10 + player.made! : -1
        expect(player.points).toBe(expected)
      })
    })
  })

  it('sums round points into a scoreboard sorted best-first', () => {
    const { game } = finished({ seed: 5 })
    const totals = new Map<string, number>()
    game.rounds.forEach((round) =>
      round.players.forEach((p) => totals.set(p.id, (totals.get(p.id) ?? 0) + p.points!)),
    )

    const scoreboard = game.scoreboard
    scoreboard.forEach((entry) => expect(entry.totalPoints).toBe(totals.get(entry.id)))
    for (let i = 1; i < scoreboard.length; i++) {
      expect(scoreboard[i - 1]!.totalPoints).toBeGreaterThanOrEqual(scoreboard[i]!.totalPoints)
    }
  })

  it('reports the same scoreboard in the game-ended event', () => {
    const { game, publisher } = finished()
    expect(publisher.last('game-ended')?.scoreboard).toEqual(game.scoreboard)
  })

  it('is deterministic for a given seed', () => {
    const a = finished({ seed: 9 })
    const b = finished({ seed: 9 })
    expect(a.publisher.events).toEqual(b.publisher.events)
  })

  it('works for every supported table size', () => {
    for (const playerCount of [2, 3, 4, 5, 6, 7]) {
      const { publisher } = finished({ playerCount, seed: playerCount })
      expect(publisher.ofType('game-ended')).toHaveLength(1)
    }
  })
})

describe('mid-game scoreboard', () => {
  /** Completes `count` rounds (through trick pauses) and their aftermath timers. */
  const playRounds = (count: number) => {
    const context = makeGame({ playerCount: 3, seed: 2 })
    const cursor = { index: 0 }
    context.game.start()
    for (let round = 1; round <= count; round++) {
      let guard = 30
      while (context.publisher.ofType('round-ended').length < round) {
        if (--guard === 0) throw new Error(`round ${round} never finished`)
        drivePendingRequests(context.game, context.publisher, context.rng, cursor)
        if (context.publisher.ofType('round-ended').length >= round) break
        context.scheduler.flush()
      }
      // aftermath: mid-game scoreboard and/or the next round's start
      context.scheduler.flush()
    }
    return context
  }

  it('pops up after round 7', () => {
    const { game, publisher } = playRounds(7)
    expect(game.scoreboardShowing).toBe(true)
    expect(publisher.ofType('scoreboard-shown')).toHaveLength(1)
    // and the game keeps going underneath
    expect(publisher.ofType('round-started')).toHaveLength(8)
  })

  it('does not pop up after other rounds', () => {
    const { publisher } = playRounds(5)
    expect(publisher.ofType('scoreboard-shown')).toHaveLength(0)
  })

  it('can be closed by the game', () => {
    const { game, publisher } = playRounds(7)
    game.closeScoreboard()
    expect(game.scoreboardShowing).toBe(false)
    expect(publisher.ofType('scoreboard-hidden')).toHaveLength(1)
  })
})

describe('snapshots and perspectives', () => {
  it('never leaks any hand anywhere in the game snapshot', () => {
    const { game, publisher, rng } = makeGame()
    game.start()
    const cursor = { index: 0 }
    drivePendingRequests(game, publisher, rng, cursor)
    expect(JSON.stringify(game.snapshot())).not.toContain('"cards"')
  })

  it('gives the betting player their options and everyone else none', () => {
    const { game } = makeGame({ playerCount: 3 })
    game.start()
    const current = game.currentRound.currentPlayer.id
    const other = game.players.find((p) => p.id !== current)!.id

    expect(game.perspective(current).availableBets.length).toBeGreaterThan(0)
    expect(game.perspective(other).availableBets).toEqual([])
    // hands come back disabled while betting — this is how reconnecting clients recover cards
    const hand = game.perspective(other).playableCards
    expect(hand.length).toBeGreaterThan(0)
    expect(hand.every((c) => c.disabled)).toBe(true)
  })

  it('knows which players belong to the game', () => {
    const { game } = makeGame()
    expect(game.hasPlayer('p1')).toBe(true)
    expect(game.hasPlayer('stranger')).toBe(false)
  })
})
