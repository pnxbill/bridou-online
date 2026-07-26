import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import type { CompletedRoundResult, CurrentRoundState } from '@bridou/engine'
import type { DomainEvent, PlayerInfo, ScoreboardEntry } from '@bridou/shared'

export const players = pgTable('players', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  photoUrl: text('photo_url'),
  isBot: boolean('is_bot').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const games = pgTable('games', {
  id: text('id').primaryKey(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  leaderId: text('leader_id').notNull(),
  playerCount: integer('player_count').notNull(),
  finalScoreboard: jsonb('final_scoreboard').$type<ScoreboardEntry[]>(),
  status: text('status').notNull().default('in_progress'),
  /** Counts toward the leaderboard: finished and started with no bot seat. */
  ranked: boolean('ranked').notNull().default(false),
})

export const gamePlayers = pgTable(
  'game_players',
  {
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    playerId: text('player_id').notNull(),
    seatIndex: integer('seat_index').notNull(),
    isBot: boolean('is_bot').notNull().default(false),
    finalPoints: integer('final_points'),
    bailadasCount: integer('bailadas_count').notNull().default(0),
    rank: integer('rank'),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.playerId] })],
)

export const gameEvents = pgTable(
  'game_events',
  {
    id: serial('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    type: text('type').notNull(),
    playerId: text('player_id'),
    payload: jsonb('payload').$type<DomainEvent>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('game_events_game_id_seq_idx').on(t.gameId, t.seq)],
)

/**
 * Live-game state for restart durability. One mutable row per active game holds
 * the in-progress round; finished rounds live write-once in gameRoundResults.
 * Both are dropped when the game ends (analytics tables above keep the record).
 */
export const gameCurrent = pgTable('game_current', {
  gameId: text('game_id').primaryKey(),
  leaderId: text('leader_id').notNull(),
  currentRoundNumber: integer('current_round_number').notNull(),
  scoreboardShowing: boolean('scoreboard_showing').notNull().default(false),
  playerOrder: jsonb('player_order').$type<PlayerInfo[]>().notNull(),
  currentRound: jsonb('current_round').$type<CurrentRoundState | null>(),
  botSeats: jsonb('bot_seats').$type<string[]>().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const gameRoundResults = pgTable(
  'game_round_results',
  {
    gameId: text('game_id').notNull(),
    roundNumber: integer('round_number').notNull(),
    results: jsonb('results').$type<CompletedRoundResult['results']>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.roundNumber] })],
)

/* ── Conquistas ──────────────────────────────────────────────────────────── */

/**
 * One row per conquista a player has earned. Insert-once: re-earning is a no-op
 * (`onConflictDoNothing`), which is what makes the unlock event fire exactly once.
 */
export const playerAchievements = pgTable(
  'player_achievements',
  {
    playerId: text('player_id').notNull(),
    achievementId: text('achievement_id').notNull(),
    gameId: text('game_id'),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.achievementId] })],
)

/**
 * Lifetime counters, maintained at `game-ended`. These exist so career-scoped
 * conquistas and mesa standings don't have to replay the whole event log.
 */
export const playerStats = pgTable('player_stats', {
  playerId: text('player_id').primaryKey(),
  gamesPlayed: integer('games_played').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  /** Games this player opened the table for — the anfitrião count. */
  hosted: integer('hosted').notNull().default(0),
  currentWinStreak: integer('current_win_streak').notNull().default(0),
  bestWinStreak: integer('best_win_streak').notNull().default(0),
  totalPoints: integer('total_points').notNull().default(0),
  bailadas: integer('bailadas').notNull().default(0),
  lastPlayedAt: timestamp('last_played_at', { withTimezone: true }),
})

/**
 * Directed head-to-head record: `wins` counts games where playerId finished
 * ahead of opponentId. `streak` is the current run of consecutive finishes
 * ahead (reset to 0 on a loss) — the Nêmesis conquista reads it.
 */
export const playerRivalries = pgTable(
  'player_rivalries',
  {
    playerId: text('player_id').notNull(),
    opponentId: text('opponent_id').notNull(),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    streak: integer('streak').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.opponentId] })],
)

/* ── Mesas & temporadas ──────────────────────────────────────────────────── */

/** A persistent group of friends. The code never expires. */
export const mesas = pgTable(
  'mesas',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('mesas_code_idx').on(t.code)],
)

export const mesaMembers = pgTable(
  'mesa_members',
  {
    mesaId: text('mesa_id')
      .notNull()
      .references(() => mesas.id, { onDelete: 'cascade' }),
    playerId: text('player_id').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.mesaId, t.playerId] })],
)

export const seasons = pgTable('seasons', {
  id: text('id').primaryKey(),
  mesaId: text('mesa_id')
    .notNull()
    .references(() => mesas.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  name: text('name').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  /** 'active' | 'finished' */
  status: text('status').notNull().default('active'),
  championId: text('champion_id'),
})

/**
 * Links a finished game back to the mesa (and season) it was played for, with
 * the season points each seat earned. Written once at `game-ended`.
 */
export const mesaGames = pgTable(
  'mesa_games',
  {
    gameId: text('game_id').primaryKey(),
    mesaId: text('mesa_id')
      .notNull()
      .references(() => mesas.id, { onDelete: 'cascade' }),
    seasonId: text('season_id'),
    playedAt: timestamp('played_at', { withTimezone: true }).notNull().defaultNow(),
  },
)

export const seasonResults = pgTable(
  'season_results',
  {
    seasonId: text('season_id').notNull(),
    gameId: text('game_id').notNull(),
    playerId: text('player_id').notNull(),
    rank: integer('rank').notNull(),
    seasonPoints: integer('season_points').notNull(),
    gamePoints: integer('game_points').notNull(),
    bailadas: integer('bailadas').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.seasonId, t.gameId, t.playerId] })],
)

/* ── Mão do Dia ──────────────────────────────────────────────────────────── */

export const dailyAttempts = pgTable(
  'daily_attempts',
  {
    /** `YYYY-MM-DD` in America/Sao_Paulo. */
    date: text('date').notNull(),
    playerId: text('player_id').notNull(),
    bet: integer('bet').notNull(),
    made: integer('made').notNull(),
    points: integer('points').notNull(),
    playedAt: timestamp('played_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.date, t.playerId] })],
)
