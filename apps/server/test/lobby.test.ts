import type { PlayerInfo } from '@bridou/shared'
import { describe, expect, it } from 'vitest'
import { LOBBY_TTL_MS, Lobby, LobbyRegistry } from '../src/application/lobby'

const player = (id: string): PlayerInfo => ({ id, name: `Player ${id}` })

describe('LobbyRegistry', () => {
  it('retries until the generated code is unique among open lobbies', () => {
    const codes = ['SAME1', 'SAME1', 'OTHER']
    const registry = new LobbyRegistry({ generateCode: () => codes.shift()! })

    expect(registry.create().code).toBe('SAME1')
    expect(registry.create().code).toBe('OTHER')
  })

  it('finds lobbies by code regardless of case and whitespace', () => {
    const registry = new LobbyRegistry()
    const lobby = registry.create()

    expect(registry.byCode(` ${lobby.code.toLowerCase()} `)).toBe(lobby)
    expect(registry.byCode('ZZZZZ')).toBeUndefined()
  })

  it('sweeps lobbies nobody touched within the TTL', () => {
    let now = 1_000_000
    const registry = new LobbyRegistry({ now: () => now })
    const stale = registry.create()
    const fresh = registry.create()

    now += LOBBY_TTL_MS - 1
    registry.byCode(fresh.code) // touching keeps it alive
    now += 2

    expect(registry.byCode(stale.code)).toBeUndefined()
    expect(registry.byCode(fresh.code)).toBe(fresh)
  })
})

describe('Lobby', () => {
  it('reports the first seat as leader and hands it over on leave', () => {
    const lobby = new Lobby('TESTE')
    lobby.add(player('a'))
    lobby.add(player('b'))

    expect(lobby.leaderId).toBe('a')
    expect(lobby.remove('a')).toBe(true)
    expect(lobby.leaderId).toBe('b')
    expect(lobby.remove('a')).toBe(false)
  })

  it('snapshots a defensive copy of the roster', () => {
    const lobby = new Lobby('TESTE')
    lobby.add(player('a'))

    const snapshot = lobby.snapshot()
    snapshot.players.push(player('intruder'))

    expect(lobby.players).toHaveLength(1)
    expect(snapshot.lobbyId).toBe(lobby.id)
    expect(snapshot.code).toBe('TESTE')
  })
})
