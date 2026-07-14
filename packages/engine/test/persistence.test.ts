import { TOTAL_ROUNDS } from '@bridou/shared'
import { describe, expect, it } from 'vitest'
import { Game } from '../src/game'
import type { Rng } from '../src/ports'
import { ManualScheduler, RecordingPublisher, makePlayers, seededRng } from './helpers'

/**
 * The persistence contract: a game serialized with `toState()` and rebuilt with
 * `fromState()` is identical, and `resume()` re-arms whatever scheduled step a
 * crash would have dropped — so an in-flight game survives a server restart.
 */

interface Live {
  game: Game
  publisher: RecordingPublisher
  scheduler: ManualScheduler
}

const start = (seed = 1, playerCount = 4): Live & { rng: Rng } => {
  const publisher = new RecordingPublisher()
  const scheduler = new ManualScheduler()
  const rng = seededRng(seed)
  const players = makePlayers(playerCount)
  const game = new Game({ id: 'g1', leaderId: players[0]!.id, players }, { publisher, scheduler, rng })
  game.start()
  return { game, publisher, scheduler, rng }
}

/** Serialize → rebuild with fresh deps → resume, exactly as the server does on reload. */
const reload = (game: Game, rng: Rng): Live => {
  const publisher = new RecordingPublisher()
  const scheduler = new ManualScheduler()
  const rebuilt = Game.fromState(game.toState(), { publisher, scheduler, rng })
  rebuilt.resume()
  return { game: rebuilt, publisher, scheduler }
}

/** Make one legal move from the game's current state, or return false if none is due. */
const nextMove = (game: Game, rng: Rng): boolean => {
  let round
  try {
    round = game.currentRound
  } catch {
    return false
  }
  if (round.betting) {
    const player = round.currentPlayer
    const bets = round.getAvailableBets(player.id)
    game.placeBet(player.id, bets[Math.floor(rng() * bets.length)]!)
    return true
  }
  const turn = round.currentTurn
  if (turn && !turn.isComplete) {
    const player = turn.currentPlayer
    const playable = round.getPlayableCards(player.id).filter((c) => !c.disabled)
    game.playCard(player.id, playable[Math.floor(rng() * playable.length)]!.value)
    return true
  }
  return false
}

/** Every seat scored exactly bet-hit (10+made) or a bailada (-1) in every round. */
const assertConsistent = (game: Game): void => {
  for (const round of game.rounds) {
    for (const p of round.players) {
      expect(p.points === -1 || p.points === 10 + (p.made ?? 0)).toBe(true)
    }
  }
  expect(Number.isFinite(game.scoreboard.reduce((a, e) => a + e.totalPoints, 0))).toBe(true)
}

describe('serialization fidelity', () => {
  it('round-trips exactly at every reachable state of a full game', () => {
    const { game, scheduler, rng } = start(7)
    let guard = 5000
    while (!game.finished) {
      if (--guard === 0) throw new Error('game never finished')

      // from(to(x)) reproduces state, snapshot and scoreboard exactly
      const rebuilt = Game.fromState(game.toState(), {
        publisher: new RecordingPublisher(),
        scheduler: new ManualScheduler(),
        rng,
      })
      expect(rebuilt.toState()).toEqual(game.toState())
      expect(rebuilt.snapshot()).toEqual(game.snapshot())
      expect(rebuilt.scoreboard).toEqual(game.scoreboard)

      if (!nextMove(game, rng)) scheduler.flush() // advance a pending transition
    }
  })
})

describe('resume after reload', () => {
  it('plays a whole game to the end while reloading before every move', () => {
    let live = start(3)
    const rng = seededRng(99)
    let guard = 8000
    while (!live.game.finished) {
      if (--guard === 0) throw new Error('reloaded game never finished')
      live = reload(live.game, rng) // crash + restart before each step
      if (nextMove(live.game, rng)) continue
      if (live.scheduler.pending.length) live.scheduler.flush()
      else if (!live.game.finished) throw new Error('game stuck with no move and no pending timer')
    }
    expect(live.game.rounds).toHaveLength(TOTAL_ROUNDS)
    assertConsistent(live.game)
  })

  it('re-arms the between-tricks pause that a crash dropped', () => {
    const { game, scheduler, rng } = start(5)
    let guard = 200
    while (!(game.currentRound.currentTurn?.isComplete && !game.currentRound.isComplete)) {
      if (--guard === 0) throw new Error('never completed a non-final trick')
      if (!nextMove(game, rng)) scheduler.flush()
    }
    expect(scheduler.pending.length).toBe(1) // the dropped startTurn

    const live = reload(game, rng) // fresh scheduler: the pause is gone…
    expect(live.game.currentRound.currentTurn?.isComplete).toBe(true)
    expect(live.scheduler.pending.length).toBe(1) // …until resume() re-armed it
    live.scheduler.flush()
    expect(live.game.currentRound.currentTurn?.isComplete).toBe(false) // a new trick began
  })

  it('re-arms the round transition that a crash dropped', () => {
    const { game, scheduler, rng } = start(2)
    let guard = 400
    while (!game.currentRound.isComplete) {
      if (--guard === 0) throw new Error('first round never completed')
      if (!nextMove(game, rng)) scheduler.flush()
    }
    expect(game.currentRoundNumber).toBe(1)

    const live = reload(game, rng)
    expect(live.game.currentRoundNumber).toBe(1) // still on round 1: the transition was dropped
    live.scheduler.flush() // resume() re-armed it
    expect(live.game.currentRoundNumber).toBe(2)
    expect(live.publisher.ofType('round-started')).toHaveLength(1)
  })

  it('keeps the played card off the hand after reloading mid-trick (aliasing)', () => {
    const { game, scheduler, rng } = start(11)
    let guard = 200
    while (!(game.currentRound.currentTurn && game.currentRound.currentTurn.playedCards.length > 0)) {
      if (--guard === 0) throw new Error('never reached a mid-trick state')
      if (!nextMove(game, rng)) scheduler.flush()
    }
    const live = reload(game, rng)
    const player = live.game.currentRound.currentTurn!.currentPlayer
    const card = live.game.currentRound.getPlayableCards(player.id).find((c) => !c.disabled)!.value
    live.game.playCard(player.id, card)
    // round and turn share the same player object, so the card left the hand
    const handAfter = live.game.currentRound.players.find((p) => p.id === player.id)!.cards
    expect(handAfter).not.toContain(card)
  })
})
