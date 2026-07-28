-- Engagement & retention: conquistas, lifetime stats, rivalries, persistent
-- mesas with seasons, and the Mão do Dia. Idempotent like the migrations
-- before it, so re-running the whole directory is always safe.

/* ── Conquistas ──────────────────────────────────────────────────────────── */

CREATE TABLE IF NOT EXISTS "player_achievements" (
  "player_id" text NOT NULL,
  "achievement_id" text NOT NULL,
  "game_id" text,
  "unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "player_achievements_player_id_achievement_id_pk" PRIMARY KEY("player_id","achievement_id")
);

CREATE TABLE IF NOT EXISTS "player_stats" (
  "player_id" text PRIMARY KEY NOT NULL,
  "games_played" integer DEFAULT 0 NOT NULL,
  "wins" integer DEFAULT 0 NOT NULL,
  "hosted" integer DEFAULT 0 NOT NULL,
  "current_win_streak" integer DEFAULT 0 NOT NULL,
  "best_win_streak" integer DEFAULT 0 NOT NULL,
  "total_points" integer DEFAULT 0 NOT NULL,
  "bailadas" integer DEFAULT 0 NOT NULL,
  "last_played_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "player_rivalries" (
  "player_id" text NOT NULL,
  "opponent_id" text NOT NULL,
  "wins" integer DEFAULT 0 NOT NULL,
  "losses" integer DEFAULT 0 NOT NULL,
  "streak" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "player_rivalries_player_id_opponent_id_pk" PRIMARY KEY("player_id","opponent_id")
);

/* ── Mesas & temporadas ──────────────────────────────────────────────────── */

CREATE TABLE IF NOT EXISTS "mesas" (
  "id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "mesas_code_idx" ON "mesas" ("code");

CREATE TABLE IF NOT EXISTS "mesa_members" (
  "mesa_id" text NOT NULL,
  "player_id" text NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mesa_members_mesa_id_player_id_pk" PRIMARY KEY("mesa_id","player_id")
);

CREATE TABLE IF NOT EXISTS "seasons" (
  "id" text PRIMARY KEY NOT NULL,
  "mesa_id" text NOT NULL,
  "number" integer NOT NULL,
  "name" text NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "champion_id" text
);

CREATE INDEX IF NOT EXISTS "seasons_mesa_idx" ON "seasons" ("mesa_id");

CREATE TABLE IF NOT EXISTS "mesa_games" (
  "game_id" text PRIMARY KEY NOT NULL,
  "mesa_id" text NOT NULL,
  "season_id" text,
  "played_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "mesa_games_mesa_idx" ON "mesa_games" ("mesa_id");

CREATE TABLE IF NOT EXISTS "season_results" (
  "season_id" text NOT NULL,
  "game_id" text NOT NULL,
  "player_id" text NOT NULL,
  "rank" integer NOT NULL,
  "season_points" integer NOT NULL,
  "game_points" integer NOT NULL,
  "bailadas" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "season_results_season_id_game_id_player_id_pk" PRIMARY KEY("season_id","game_id","player_id")
);

/* ── Mão do Dia ──────────────────────────────────────────────────────────── */

CREATE TABLE IF NOT EXISTS "daily_attempts" (
  "date" text NOT NULL,
  "player_id" text NOT NULL,
  "bet" integer NOT NULL,
  "made" integer NOT NULL,
  "points" integer NOT NULL,
  "played_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "daily_attempts_date_player_id_pk" PRIMARY KEY("date","player_id")
);

/* ── Foreign keys (added separately so re-runs don't fail on duplicates) ──── */

DO $$ BEGIN
  ALTER TABLE "mesa_members" ADD CONSTRAINT "mesa_members_mesa_id_fk"
    FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "seasons" ADD CONSTRAINT "seasons_mesa_id_fk"
    FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "mesa_games" ADD CONSTRAINT "mesa_games_mesa_id_fk"
    FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
