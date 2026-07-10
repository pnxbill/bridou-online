import type { VoicePresence, VoiceSignal } from '@bridou/shared'
import type { AddressInfo } from 'node:net'
import { io, type Socket } from 'socket.io-client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApp, type AppInstance } from '../src/app'

/**
 * End-to-end voice signaling over the /voice namespace: joining delivers the
 * roster, the room hears joins/leaves/mutes, and offers/answers/candidates
 * are relayed only to their target with a server-stamped `from`.
 */

const waitFor = async (predicate: () => boolean, what: string, timeoutMs = 3000): Promise<void> => {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for: ${what}`)
    await new Promise((r) => setTimeout(r, 15))
  }
}

class VoiceClient {
  socket: Socket
  rosters: VoicePresence[][] = []
  joined: VoicePresence[] = []
  left: string[] = []
  signals: VoiceSignal[] = []
  mutes: { playerId: string; micMuted: boolean }[] = []

  constructor(baseUrl: string, gameId: string, playerId: string) {
    this.socket = io(`${baseUrl}/voice`, { auth: { gameId, playerId } })
    this.socket.on('voice:roster', (roster: VoicePresence[]) => this.rosters.push(roster))
    this.socket.on('voice:peer-joined', (peer: VoicePresence) => this.joined.push(peer))
    this.socket.on('voice:peer-left', ({ playerId }: { playerId: string }) =>
      this.left.push(playerId),
    )
    this.socket.on('voice:signal', (signal: VoiceSignal) => this.signals.push(signal))
    this.socket.on('voice:mute-changed', (mute: { playerId: string; micMuted: boolean }) =>
      this.mutes.push(mute),
    )
  }
}

describe('voice signaling over /voice', () => {
  let app: AppInstance
  let baseUrl: string
  const clients: VoiceClient[] = []

  const connect = async (gameId: string, playerId: string): Promise<VoiceClient> => {
    const client = new VoiceClient(baseUrl, gameId, playerId)
    clients.push(client)
    await waitFor(() => client.rosters.length > 0, `${playerId} got the roster`)
    return client
  }

  beforeAll(async () => {
    app = createApp()
    await new Promise<void>((resolve) => app.httpServer.listen(0, resolve))
    baseUrl = `http://localhost:${(app.httpServer.address() as AddressInfo).port}`
  })

  afterEach(() => {
    for (const client of clients.splice(0)) client.socket.disconnect()
  })

  afterAll(async () => {
    await app.close()
  })

  it('gives the joiner the roster and tells the room who arrived', async () => {
    const alice = await connect('g1', 'alice')
    expect(alice.rosters[0]).toEqual([])

    const bob = await connect('g1', 'bob')
    expect(bob.rosters[0]).toEqual([{ playerId: 'alice', micMuted: false }])

    await waitFor(() => alice.joined.length === 1, 'alice hears bob join')
    expect(alice.joined[0]).toEqual({ playerId: 'bob', micMuted: false })
  })

  it('relays signals only to their target, stamping the real sender', async () => {
    const alice = await connect('g2', 'alice')
    const bob = await connect('g2', 'bob')
    const carol = await connect('g2', 'carol')

    // bob lies about `from` — the relay stamps his real identity
    bob.socket.emit('voice:signal', {
      type: 'offer',
      from: 'mallory',
      to: 'alice',
      sdp: 'offer-from-bob',
    } satisfies VoiceSignal)

    await waitFor(() => alice.signals.length === 1, 'alice gets the offer')
    expect(alice.signals[0]).toEqual({
      type: 'offer',
      from: 'bob',
      to: 'alice',
      sdp: 'offer-from-bob',
    })

    alice.socket.emit('voice:signal', {
      type: 'answer',
      from: 'alice',
      to: 'bob',
      sdp: 'answer-from-alice',
    } satisfies VoiceSignal)
    alice.socket.emit('voice:signal', {
      type: 'ice',
      from: 'alice',
      to: 'bob',
      candidate: { candidate: 'candidate:1', sdpMid: '0' },
    } satisfies VoiceSignal)

    await waitFor(() => bob.signals.length === 2, 'bob gets answer and candidate')
    expect(bob.signals.map((s) => s.type)).toEqual(['answer', 'ice'])
    expect(carol.signals).toEqual([]) // bystander hears nothing
  })

  it('broadcasts mute changes and exposes the roster over REST', async () => {
    const alice = await connect('g3', 'alice')
    const bob = await connect('g3', 'bob')

    alice.socket.emit('voice:mute-changed', true)
    await waitFor(() => bob.mutes.length === 1, 'bob hears the mute')
    expect(bob.mutes[0]).toEqual({ playerId: 'alice', micMuted: true })

    const res = await fetch(`${baseUrl}/api/games/g3/voice`)
    const { participants } = (await res.json()) as { participants: VoicePresence[] }
    expect(participants).toEqual(
      expect.arrayContaining([
        { playerId: 'alice', micMuted: true },
        { playerId: 'bob', micMuted: false },
      ]),
    )
    expect(participants).toHaveLength(2)
  })

  it('tells the room when someone hangs up and forgets empty rooms', async () => {
    const alice = await connect('g4', 'alice')
    const bob = await connect('g4', 'bob')

    bob.socket.disconnect()
    await waitFor(() => alice.left.length === 1, 'alice hears bob leave')
    expect(alice.left).toEqual(['bob'])

    alice.socket.disconnect()
    await waitFor(() => !alice.socket.connected, 'alice disconnected')

    const res = await fetch(`${baseUrl}/api/games/g4/voice`)
    const { participants } = (await res.json()) as { participants: VoicePresence[] }
    expect(participants).toEqual([])
  })

  it('replaces a stale connection when the same player reconnects', async () => {
    const alice = await connect('g5', 'alice')
    const aliceAgain = await connect('g5', 'alice')

    expect(aliceAgain.rosters[0]).toEqual([]) // she only replaced herself
    await waitFor(() => !alice.socket.connected, 'stale connection dropped')

    const res = await fetch(`${baseUrl}/api/games/g5/voice`)
    const { participants } = (await res.json()) as { participants: VoicePresence[] }
    expect(participants).toEqual([{ playerId: 'alice', micMuted: false }])
  })
})
