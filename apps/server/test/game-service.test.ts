import type { DomainEvent, LobbySnapshot, PlayerInfo } from '@bridou/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { AbandonmentService } from '../src/application/abandonment'
import { GameService } from '../src/application/game-service'
import { LobbyRegistry } from '../src/application/lobby'
import type { RealtimeGateway } from '../src/application/ports'
import { InMemoryGameRepository } from '../src/infra/in-memory-game-repository'

class FakeGateway implements RealtimeGateway {
  published: { gameId: string; event: DomainEvent }[] = []
  lobbyUpdates: { lobbyId: string; lobby: LobbySnapshot }[] = []
  started: string[] = []

  publisherFor(gameId: string) {
    return { publish: (event: DomainEvent) => this.published.push({ gameId, event }) }
  }

  lobbyUpdated(lobbyId: string, lobby: LobbySnapshot) {
    this.lobbyUpdates.push({ lobbyId, lobby })
  }

  gameStarted(gameId: string) {
    this.started.push(gameId)
  }
}

const player = (id: string): PlayerInfo => ({ id, name: `Player ${id}` })

describe('GameService', () => {
  let service: GameService
  let gateway: FakeGateway

  beforeEach(() => {
    gateway = new FakeGateway()
    const games = new InMemoryGameRepository()
    service = new GameService(games, new LobbyRegistry(), gateway, new AbandonmentService({ games }))
  })

  const lobbyWith = (...ids: string[]): LobbySnapshot => {
    const lobby = service.createLobby(player(ids[0]!))
    for (const id of ids.slice(1)) service.joinLobby(lobby.code, player(id))
    return service.lobbyState(lobby.code)
  }

  it('opens a lobby with the creator as leader and a shareable code', () => {
    const lobby = service.createLobby(player('a'))

    expect(lobby.leaderId).toBe('a')
    expect(lobby.code).toMatch(/^[A-Z2-9]{5}$/)
    expect(lobby.players.map((p) => p.id)).toEqual(['a'])
  })

  it('joins by code (case-insensitive) and broadcasts the new roster', () => {
    const { code } = service.createLobby(player('a'))
    const joined = service.joinLobby(code.toLowerCase(), player('b'))

    expect(joined.leaderId).toBe('a')
    expect(joined.players.map((p) => p.id)).toEqual(['a', 'b'])
    expect(gateway.lobbyUpdates).toHaveLength(1)
    expect(gateway.lobbyUpdates[0]!.lobby.players).toHaveLength(2)
  })

  it('treats re-joining as a no-op — invite links are re-clickable', () => {
    const { code } = service.createLobby(player('a'))
    service.joinLobby(code, player('a'))

    expect(service.lobbyState(code).players).toHaveLength(1)
    expect(gateway.lobbyUpdates).toHaveLength(0)
  })

  it('rejects unknown lobby codes', () => {
    expect(() => service.joinLobby('NOPES', player('a'))).toThrow('Lobby not found')
    expect(() => service.lobbyState('NOPES')).toThrow('Lobby not found')
  })

  it('keeps lobbies independent of each other', () => {
    const first = lobbyWith('a', 'b')
    const second = lobbyWith('c')

    expect(first.code).not.toBe(second.code)
    expect(service.lobbyState(second.code).players.map((p) => p.id)).toEqual(['c'])
    expect(service.lobbyState(first.code).players.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('passes leadership to the next seat when the leader leaves', () => {
    const { code } = lobbyWith('a', 'b')
    const after = service.leaveLobby(code, 'a')

    expect(after.leaderId).toBe('b')
    expect(after.players.map((p) => p.id)).toEqual(['b'])
    expect(gateway.lobbyUpdates.at(-1)!.lobby.leaderId).toBe('b')
  })

  it('closes the lobby when the last human leaves', () => {
    const { code } = lobbyWith('a')
    service.addBotToLobby(code, 'a')
    service.leaveLobby(code, 'a')

    expect(() => service.lobbyState(code)).toThrow('Lobby not found')
  })

  it('lets only the leader add clearly-flagged bots with distinct names', () => {
    const { code } = lobbyWith('a', 'b')
    expect(() => service.addBotToLobby(code, 'b')).toThrow('Only the leader')

    const first = service.addBotToLobby(code, 'a').bot
    const second = service.addBotToLobby(code, 'a').bot

    expect(first.isBot).toBe(true)
    expect(second.isBot).toBe(true)
    expect(first.name).not.toBe(second.name)
    expect(service.lobbyState(code).players.filter((p) => p.isBot)).toHaveLength(2)
  })

  it('caps the table at 7 players', () => {
    const { code } = lobbyWith('a')
    for (let i = 0; i < 6; i++) service.addBotToLobby(code, 'a')

    expect(() => service.addBotToLobby(code, 'a')).toThrow('Table is full')
    expect(() => service.joinLobby(code, player('b'))).toThrow('Table is full')
  })

  it('refuses to start with fewer than 2 players', () => {
    const { code } = lobbyWith('a')
    expect(() => service.startGame(code, 'a')).toThrow('Required at least 2 players')
  })

  it('lets only the leader start the game', () => {
    const { code } = lobbyWith('a', 'b')
    expect(() => service.startGame(code, 'b')).toThrow('Only the leader')
  })

  it('starts a game with the lobby id, announces it, and closes the lobby', () => {
    const { code, lobbyId } = lobbyWith('a', 'b')

    const game = service.startGame(code, 'a')

    expect(game.id).toBe(lobbyId)
    expect(gateway.started).toEqual([lobbyId])
    expect(() => service.lobbyState(code)).toThrow('Lobby not found')
    // the first round begins immediately
    expect(gateway.published.some(({ event }) => event.type === 'round-started')).toBe(true)
  })

  it('gives an entering player the snapshot plus their private perspective', () => {
    const { code } = lobbyWith('a', 'b')
    const game = service.startGame(code, 'a')

    const result = service.enterGame(game.id, 'a')

    expect(result.id).toBe(game.id)
    expect(result.leaderId).toBe('a')
    expect(result.currentRound.betting).toBe(true)
    expect(result.availableBets.length).toBeGreaterThan(0) // 'a' bets first
    expect(result.playableCards.length).toBe(1) // round 1: one card, disabled while betting
    expect(JSON.stringify(result.currentRound)).not.toContain('"cards"')
  })

  it('rejects strangers and unknown games', () => {
    const { code } = lobbyWith('a', 'b')
    const game = service.startGame(code, 'a')

    expect(() => service.enterGame(game.id, 'stranger')).toThrow("You're not in this game")
    expect(() => service.enterGame('nope', 'a')).toThrow('Game not found')
  })

  it('finds the active game for a seated player', () => {
    expect(service.currentGame('a')).toEqual({ gameId: null })

    const { code } = lobbyWith('a', 'b')
    const game = service.startGame(code, 'a')

    expect(service.currentGame('a')).toEqual({ gameId: game.id })
    expect(service.currentGame('b')).toEqual({ gameId: game.id })
    expect(service.currentGame('stranger')).toEqual({ gameId: null })
  })

  it('routes bets and plays into the engine', () => {
    const { code } = lobbyWith('a', 'b')
    const game = service.startGame(code, 'a')

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
