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
  /** Counts toward the leaderboard: finished with no bot seat and no bot takeover. */
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
