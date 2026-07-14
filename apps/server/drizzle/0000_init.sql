CREATE TABLE IF NOT EXISTS "players" (
  "id" text PRIMARY KEY NOT NULL,
  "display_name" text NOT NULL,
  "photo_url" text,
  "is_bot" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "games" (
  "id" text PRIMARY KEY NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "ended_at" timestamp with time zone,
  "leader_id" text NOT NULL,
  "player_count" integer NOT NULL,
  "final_scoreboard" jsonb,
  "status" text DEFAULT 'in_progress' NOT NULL
);

CREATE TABLE IF NOT EXISTS "game_players" (
  "game_id" text NOT NULL,
  "player_id" text NOT NULL,
  "seat_index" integer NOT NULL,
  "is_bot" boolean DEFAULT false NOT NULL,
  "final_points" integer,
  "bailadas_count" integer DEFAULT 0 NOT NULL,
  "rank" integer,
  CONSTRAINT "game_players_game_id_player_id_pk" PRIMARY KEY("game_id","player_id")
);

CREATE TABLE IF NOT EXISTS "game_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "game_id" text NOT NULL,
  "seq" integer NOT NULL,
  "type" text NOT NULL,
  "player_id" text,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "game_players" ADD CONSTRAINT "game_players_game_id_games_id_fk"
  FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "game_events" ADD CONSTRAINT "game_events_game_id_games_id_fk"
  FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "game_events_game_id_seq_idx" ON "game_events" USING btree ("game_id","seq");

-- Live-game durability (survives a server restart). Separate from the analytics
-- tables above on purpose: these are ephemeral and dropped when a game ends.
-- Only the in-progress round churns; finished rounds land in game_round_results
-- once and are never rewritten.
CREATE TABLE IF NOT EXISTS "game_current" (
  "game_id" text PRIMARY KEY NOT NULL,
  "leader_id" text NOT NULL,
  "current_round_number" integer NOT NULL,
  "scoreboard_showing" boolean DEFAULT false NOT NULL,
  "player_order" jsonb NOT NULL,
  "current_round" jsonb,
  "bot_seats" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "game_round_results" (
  "game_id" text NOT NULL,
  "round_number" integer NOT NULL,
  "results" jsonb NOT NULL,
  CONSTRAINT "game_round_results_pk" PRIMARY KEY("game_id","round_number")
);
