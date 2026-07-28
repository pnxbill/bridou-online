/**
 * "Quem tá on" — who is around right now, across the whole app.
 *
 * `PresenceTracker` answers a different question (is this seat connected to
 * THIS game), which is the wrong shape for a mesa: the people worth showing are
 * the ones idling on the home screen who could be pulled into a table. So this
 * is a plain last-seen ledger, touched by any authenticated request and by every
 * realtime connection, with a short TTL.
 *
 * Deliberately in-memory and non-durable: a stale "online" badge is worse than
 * a missing one, and after a restart nobody is online until they act again.
 */
export class OnlineTracker {
  private readonly seen = new Map<string, number>()

  constructor(
    private readonly ttlMs = 90_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  touch(playerId: string): void {
    if (!playerId) return
    this.seen.set(playerId, this.now())
  }

  isOnline(playerId: string): boolean {
    const at = this.seen.get(playerId)
    return at !== undefined && this.now() - at < this.ttlMs
  }

  onlinePlayerIds(): ReadonlySet<string> {
    const cutoff = this.now() - this.ttlMs
    const live = new Set<string>()
    for (const [playerId, at] of this.seen) {
      if (at >= cutoff) live.add(playerId)
      else this.seen.delete(playerId) // lazy sweep, same shape as the lobby registry
    }
    return live
  }
}
