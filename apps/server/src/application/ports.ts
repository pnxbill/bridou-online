import type {
  DomainEvent,
  EventPublisher,
  HeadToHead,
  LobbySnapshot,
  PlayerInfo,
  RankingEntry,
  SessionState,
  ScoreboardEntry,
  UnlockedAchievement,
} from '@bridou/shared'
import type { CompletedRoundResult, CurrentRoundState, Game } from '@bridou/engine'

export interface GameRepository {
  get(gameId: string): Game | undefined
  save(game: Game): void
  delete(gameId: string): void
  /** Unfinished game the player is seated in, if any (from the in-memory cache). */
  findActiveByPlayerId(playerId: string): Game | undefined
  /**
   * Load a game into the cache from durable storage if it isn't already there
   * (used after a restart). No-op for the in-memory repository. Call before a
   * sync `get` on the reconnect paths.
   */
  hydrate?(gameId: string): Promise<Game | undefined>
  /** Durable lookup of a player's active game id, for reconnect after a restart. */
  findActivePlayerGameId?(playerId: string): Promise<string | null>
}

/** The mutable per-game row: the churning current round plus session state. */
export interface StoredGameCurrent {
  gameId: string
  leaderId: string
  currentRoundNumber: number
  scoreboardShowing: boolean
  playerOrder: PlayerInfo[]
  currentRound: CurrentRoundState | null
  botSeats: string[]
}

/**
 * Storage mechanism behind the durable game repository — the dumb read/write
 * half, with the caching/rehydration policy living in the repository. Postgres
 * in production; an in-memory implementation makes restart behavior testable.
 */
export interface GameStateStore {
  upsertCurrent(row: StoredGameCurrent): Promise<void>
  /** Write a finished round's result. Idempotent — the same round is written once. */
  insertRoundResult(
    gameId: string,
    roundNumber: number,
    results: CompletedRoundResult['results'],
  ): Promise<void>
  load(
    gameId: string,
  ): Promise<{ current: StoredGameCurrent; results: CompletedRoundResult[] } | null>
  delete(gameId: string): Promise<void>
  /** The game id an unfinished player is seated in, if any (durable lookup). */
  findGameIdByPlayer(playerId: string): Promise<string | null>
}

/**
 * Everything the application needs from the realtime transport.
 * Implemented by socket.io today; an SSE implementation slots in here
 * without touching use-cases or the engine.
 */
export interface RealtimeGateway {
  /** Publisher that fans a game's domain events out to its players. */
  publisherFor(gameId: string): EventPublisher
  /** Full lobby state on every roster change — clients replace, never merge. */
  lobbyUpdated(lobbyId: string, lobby: LobbySnapshot): void
  gameStarted(gameId: string): void
}

/**
 * Turns a client credential (Firebase ID token) into a trusted identity.
 * Every transport authenticates through this port; tests inject a fake.
 */
export interface TokenVerifier {
  /** Resolves the verified player, or null when the token is invalid/expired. */
  verify(token: string): Promise<PlayerInfo | null>
}

/** Seat control as GameService sees it (implemented by AbandonmentService). */
export interface GameSessionMonitor {
  /** Throws while the game is paused waiting on an abandoned seat. */
  assertPlayable(gameId: string): void
  sessionState(gameId: string): SessionState
  /** Seats that are bots from the start; call before the game's first event. */
  registerBotSeats(gameId: string, playerIds: string[]): void
}

/** One persisted domain event with server-added envelope fields. */
export interface StoredGameEvent {
  gameId: string
  seq: number
  type: DomainEvent['type']
  playerId: string | null
  payload: DomainEvent
  createdAt: Date
}

export interface FinishedGamePlayer {
  playerId: string
  seatIndex: number
  isBot: boolean
  finalPoints: number
  bailadasCount: number
  rank: number
}

export interface FinishedGameRecord {
  gameId: string
  startedAt: Date
  endedAt: Date
  leaderId: string
  players: FinishedGamePlayer[]
  finalScoreboard: ScoreboardEntry[]
  /** Counts toward the leaderboard — started with no bot seat. */
  ranked: boolean
}

/** A stored game's envelope, without its event log. */
export interface StoredGameSummary {
  gameId: string
  startedAt: Date
  endedAt: Date | null
  status: string
  ranked: boolean
  playerCount: number
  finalScoreboard: ScoreboardEntry[] | null
}

/** Append-only history for analytics — not the live game source of truth. */
export interface GameHistoryRepository {
  /** Envelope for one game — the resenha needs its timings and ranked flag. */
  getGame(gameId: string): Promise<StoredGameSummary | null>
  /** Ensure a games row exists (status in_progress) before events land. */
  ensureGameStarted(input: {
    gameId: string
    leaderId: string
    playerCount: number
    startedAt?: Date
  }): Promise<void>
  appendEvent(gameId: string, seq: number, event: DomainEvent): Promise<void>
  saveFinishedGame(record: FinishedGameRecord): Promise<void>
  getGameEvents(gameId: string): Promise<StoredGameEvent[]>
  listPlayerGames(playerId: string): Promise<string[]>
  /** All-time leaderboard over ranked games only, best first. */
  getLeaderboard(): Promise<RankingEntry[]>
}

export interface PlayerRepository {
  upsert(player: PlayerInfo): Promise<void>
  /** Resolve display names/photos in bulk — standings and rosters need them. */
  getMany(playerIds: string[]): Promise<PlayerInfo[]>
}

/* ── Mesas & temporadas ──────────────────────────────────────────────────── */

export interface MesaRecord {
  id: string
  code: string
  name: string
  createdBy: string
  createdAt: Date
}

export interface SeasonRecord {
  id: string
  mesaId: string
  number: number
  name: string
  startsAt: Date
  endsAt: Date
  status: 'active' | 'finished'
  championId: string | null
}

/** One seat's contribution to a season, written once per finished game. */
export interface SeasonResultRow {
  playerId: string
  rank: number
  seasonPoints: number
  gamePoints: number
  bailadas: number
}

/** Per-player season totals, before names and positions are attached. */
export interface StandingAggregate {
  playerId: string
  gamesPlayed: number
  wins: number
  points: number
  totalGamePoints: number
  bailadas: number
}

export interface MesaGameRow {
  gameId: string
  playedAt: Date
  playerCount: number
  championId: string
  championPoints: number
}

/* ── Mão do Dia ──────────────────────────────────────────────────────────── */

/**
 * One player's run at one day's hand.
 *
 * `bet` + `plays` are the whole record: the table is replayed from them on
 * every request (see `DailyHandService`), so this row is the entire savegame
 * and an unfinished hand resumes anywhere the player signs in.
 */
export interface DailyAttemptRow {
  date: string
  playerId: string
  bet: number
  /** Cards the player has played, in order. */
  plays: string[]
  made: number
  points: number
  /** All five tricks played. Unfinished attempts don't score and don't count. */
  finished: boolean
  /** When the bet was placed — the attempt opened. */
  playedAt: Date
  finishedAt: Date | null
}

export interface DailyRepository {
  /**
   * Opens the day's attempt with the player's bet. One per player per day — a
   * second call is rejected, not overwritten, which is what makes the bet
   * final the moment it's placed.
   */
  start(input: { date: string; playerId: string; bet: number }): Promise<boolean>
  /**
   * Appends a played card, but only if the stored hand is still exactly
   * `afterPlays` cards long. Two taps racing each other can't both land, and a
   * replayed request is a no-op rather than a second card.
   */
  appendPlay(
    date: string,
    playerId: string,
    card: string,
    afterPlays: number,
  ): Promise<boolean>
  /** Records the final score. Idempotent. */
  finish(date: string, playerId: string, made: number, points: number): Promise<void>
  attemptFor(date: string, playerId: string): Promise<DailyAttemptRow | null>
  /** Finished attempts only, best first. */
  leaderboard(date: string, playerIds?: string[]): Promise<DailyAttemptRow[]>
  /** Consecutive days *finished* up to and including `date`. */
  streak(playerId: string, date: string): Promise<number>
}

export interface MesaRepository {
  create(input: { id: string; code: string; name: string; createdBy: string }): Promise<MesaRecord>
  byCode(code: string): Promise<MesaRecord | null>
  byId(mesaId: string): Promise<MesaRecord | null>
  rename(mesaId: string, name: string): Promise<void>

  addMember(mesaId: string, playerId: string): Promise<void>
  removeMember(mesaId: string, playerId: string): Promise<void>
  members(mesaId: string): Promise<Array<{ playerId: string; joinedAt: Date }>>
  listForPlayer(playerId: string): Promise<MesaRecord[]>

  activeSeason(mesaId: string): Promise<SeasonRecord | null>
  createSeason(input: {
    id: string
    mesaId: string
    number: number
    name: string
    startsAt: Date
    endsAt: Date
  }): Promise<SeasonRecord>
  finishSeason(seasonId: string, championId: string | null): Promise<void>
  listSeasons(mesaId: string): Promise<SeasonRecord[]>

  /** Ties a started game to the mesa (and the season it counts toward). */
  linkGame(gameId: string, mesaId: string, seasonId: string | null): Promise<void>
  gameLink(gameId: string): Promise<{ mesaId: string; seasonId: string | null } | null>
  recordResults(seasonId: string, gameId: string, rows: SeasonResultRow[]): Promise<void>
  standings(seasonId: string): Promise<StandingAggregate[]>
  /** Games played by this mesa, newest first. */
  recentGames(mesaId: string, limit: number): Promise<MesaGameRow[]>
  /** Games played by this mesa, for counting a member's appearances. */
  gameCountsByPlayer(mesaId: string): Promise<Record<string, number>>
}

/* ── Conquistas ──────────────────────────────────────────────────────────── */

export interface AchievementRepository {
  /**
   * Awards a conquista. Returns true only the first time — that's what makes
   * the unlock event fire exactly once no matter how often a rule matches.
   */
  unlock(playerId: string, achievementId: string, gameId: string | null): Promise<boolean>
  listFor(playerId: string): Promise<UnlockedAchievement[]>
  countFor(playerId: string): Promise<number>
  /** Unlocks earned during one game — used to build the resenha. */
  listForGame(gameId: string): Promise<Array<{ playerId: string; achievementId: string }>>
}

/** Lifetime counters for one player. */
export interface PlayerCareerStats {
  playerId: string
  gamesPlayed: number
  wins: number
  hosted: number
  currentWinStreak: number
  bestWinStreak: number
  totalPoints: number
  bailadas: number
}

/** One player's line in a finished game, as the stats layer needs it. */
export interface PlayerGameOutcome {
  playerId: string
  rank: number
  points: number
  bailadas: number
  /** Everyone this player finished ahead of / behind, for the rivalry ledger. */
  beat: string[]
  lostTo: string[]
}

export interface PlayerStatsRepository {
  get(playerId: string): Promise<PlayerCareerStats>
  /** Applies a finished game to lifetime counters and returns the new totals. */
  applyGameResult(outcome: PlayerGameOutcome): Promise<PlayerCareerStats>
  /** Bumps the anfitrião counter when a player opens a table. */
  bumpHosted(playerId: string): Promise<void>
  /** Longest current run of finishing ahead of a single opponent. */
  bestRivalryStreak(playerId: string): Promise<number>
  headToHead(playerId: string): Promise<HeadToHead[]>
}
