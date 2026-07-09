import type { DomainEvent, PlayerInfo } from '@bridou/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { AbandonmentService } from '../src/application/abandonment'
import { GameService } from '../src/application/game-service'
import { Queue } from '../src/application/queue'
import type { RealtimeGateway } from '../src/application/ports'
import { InMemoryGameRepository } from '../src/infra/in-memory-game-repository'

class FakeGateway implements RealtimeGateway {
  published: { gameId: string; event: DomainEvent }[] = []
  queueJoins: { queueId: string; player: PlayerInfo }[] = []
  started: string[] = []

  publisherFor(gameId: string) {
    return { publish: (event: DomainEvent) => this.published.push({ gameId, event }) }
  }

  playerJoinedQueue(queueId: string, player: PlayerInfo) {
    this.queueJoins.push({ queueId, player })
  }

  gameStarted(gameId: string) {
    this.started.push(gameId)
  }
}

const player = (id: string): PlayerInfo => ({ id, name: `Player ${id}` })

describe('GameService', () => {
  let service: GameService
  let gateway: FakeGateway
  let queue: Queue

  beforeEach(() => {
    gateway = new FakeGateway()
    queue = new Queue()
    const games = new InMemoryGameRepository()
    service = new GameService(games, queue, gateway, new AbandonmentService({ games }))
  })

  it('queues players, reporting the first as leader', () => {
    const first = service.joinQueue(player('a'))
    const second = service.joinQueue(player('b'))

    expect(first.leaderId).toBe('a')
    expect(second.leaderId).toBe('a')
    expect(second.queueId).toBe(first.queueId)
    expect(gateway.queueJoins).toHaveLength(2)
    expect(service.queueState().queue.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('rejects joining the queue twice', () => {
    service.joinQueue(player('a'))
    expect(() => service.joinQueue(player('a'))).toThrow('Already on the queue')
  })

  it('refuses to start with fewer than 2 players', () => {
    service.joinQueue(player('a'))
    expect(() => service.startGame()).toThrow('Required at least 2 players')
  })

  it('starts a game with the queue id, announces it, and resets the queue', () => {
    const { queueId } = service.joinQueue(player('a'))
    service.joinQueue(player('b'))

    const game = service.startGame()

    expect(game.id).toBe(queueId)
    expect(gateway.started).toEqual([queueId])
    expect(service.queueState().queue).toEqual([])
    expect(service.queueState().queueId).not.toBe(queueId)
    // the first round begins immediately
    expect(gateway.published.some(({ event }) => event.type === 'round-started')).toBe(true)
  })

  it('gives an entering player the snapshot plus their private perspective', () => {
    service.joinQueue(player('a'))
    service.joinQueue(player('b'))
    const game = service.startGame()

    const result = service.enterGame(game.id, 'a')

    expect(result.id).toBe(game.id)
    expect(result.leaderId).toBe('a')
    expect(result.currentRound.betting).toBe(true)
    expect(result.availableBets.length).toBeGreaterThan(0) // 'a' bets first
    expect(result.playableCards.length).toBe(1) // round 1: one card, disabled while betting
    expect(JSON.stringify(result.currentRound)).not.toContain('"cards"')
  })

  it('rejects strangers and unknown games', () => {
    service.joinQueue(player('a'))
    service.joinQueue(player('b'))
    const game = service.startGame()

    expect(() => service.enterGame(game.id, 'stranger')).toThrow("You're not in this game")
    expect(() => service.enterGame('nope', 'a')).toThrow('Game not found')
  })

  it('routes bets and plays into the engine', () => {
    service.joinQueue(player('a'))
    service.joinQueue(player('b'))
    const game = service.startGame()

    service.placeBet(game.id, 'a', 0)
    expect(() => service.placeBet(game.id, 'a', 0)).toThrow('Not your turn')

    const lastBets = service.enterGame(game.id, 'b').availableBets
    expect(lastBets.length).toBeGreaterThan(0)
    service.placeBet(game.id, 'b', lastBets[0]!)

    // betting done — someone now has a playable card
    const playable = ['a', 'b']
      .map((id) => ({ id, cards: service.enterGame(game.id, id).playableCards }))
      .find(({ cards }) => cards.some((c) => !c.disabled))!
    expect(playable).toBeDefined()

    service.playCard(game.id, playable.id, playable.cards[0]!.value)
    const played = gateway.published.filter(({ event }) => event.type === 'card-played')
    expect(played).toHaveLength(1)
  })
})
