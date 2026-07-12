import type { Scheduler } from '@bridou/engine'
import { beforeEach, describe, expect, it } from 'vitest'
import { AbandonmentService } from '../src/application/abandonment'
import { GAME_EVICTION_TTL_MS, GameEviction } from '../src/application/game-eviction'
import { GameService } from '../src/application/game-service'
import { LobbyRegistry } from '../src/application/lobby'
import type { RealtimeGateway } from '../src/application/ports'
import type { DomainEvent, PlayerInfo } from '@bridou/shared'
import { InMemoryGameRepository } from '../src/infra/in-memory-game-repository'
import { InterceptingGateway } from '../src/infra/intercepting-gateway'

class RecordingGateway implements RealtimeGateway {
  publisherFor() {
    return { publish: (_event: DomainEvent) => {} }
  }
  lobbyUpdated(): void {}
  gameStarted(): void {}
}

class ManualScheduler implements Scheduler {
  pending: { fn: () => void; delayMs: number }[] = []

  schedule(fn: () => void, delayMs: number): void {
    this.pending.push({ fn, delayMs })
  }

  flushMatching(delayMs: number): void {
    const matched = this.pending.filter((p) => p.delayMs === delayMs)
    this.pending = this.pending.filter((p) => p.delayMs !== delayMs)
    matched.forEach(({ fn }) => fn())
  }
}

const player = (id: string): PlayerInfo => ({ id, name: `Player ${id}` })

describe('GameEviction', () => {
  let games: InMemoryGameRepository
  let scheduler: ManualScheduler
  let eviction: GameEviction
  let gameId: string

  beforeEach(() => {
    games = new InMemoryGameRepository()
    scheduler = new ManualScheduler()
    eviction = new GameEviction({ games, scheduler })

    const gateway = new InterceptingGateway(new RecordingGateway(), (g, e) =>
      eviction.onDomainEvent(g, e),
    )
    const service = new GameService(
      games,
      new LobbyRegistry(),
      gateway,
      new AbandonmentService({ games }),
    )
    const { code, lobbyId } = service.createLobby(player('a'))
    service.joinLobby(code, player('b'))
    gameId = lobbyId
    service.startGame(code, 'a')
  })

  it('keeps the finished game until the TTL elapses', () => {
    eviction.onDomainEvent(gameId, { type: 'game-ended', scoreboard: [] })

    expect(games.get(gameId)).toBeDefined()
    expect(scheduler.pending).toEqual([
      expect.objectContaining({ delayMs: GAME_EVICTION_TTL_MS }),
    ])
  })

  it('deletes the game once the TTL fires', () => {
    eviction.onDomainEvent(gameId, { type: 'game-ended', scoreboard: [] })
    scheduler.flushMatching(GAME_EVICTION_TTL_MS)

    expect(games.get(gameId)).toBeUndefined()
  })

  it('ignores non-terminal events', () => {
    eviction.onDomainEvent(gameId, { type: 'scoreboard-hidden' })

    expect(scheduler.pending).toHaveLength(0)
    expect(games.get(gameId)).toBeDefined()
  })
})
