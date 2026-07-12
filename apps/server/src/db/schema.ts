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
import type { DomainEvent, ScoreboardEntry } from '@bridou/shared'

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
