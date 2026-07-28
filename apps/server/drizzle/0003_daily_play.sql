/*
 * Mão do Dia: the hand is played out, not just bet on.
 *
 * An attempt is now opened when the bet is placed and closed when the fifth
 * trick lands, so it needs to carry the cards played so far — `plays` plus the
 * bet is the entire savegame, since the table is replayed from them.
 *
 * `finished` defaults to true so the rows written by the old bet-and-resolve
 * version stay on the leaderboard and keep counting toward streaks.
 */

ALTER TABLE "daily_attempts" ADD COLUMN IF NOT EXISTS "plays" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "daily_attempts" ADD COLUMN IF NOT EXISTS "finished" boolean DEFAULT true NOT NULL;
ALTER TABLE "daily_attempts" ADD COLUMN IF NOT EXISTS "finished_at" timestamp with time zone;

/* New attempts start at 0/0 and are scored when they finish. */
ALTER TABLE "daily_attempts" ALTER COLUMN "made" SET DEFAULT 0;
ALTER TABLE "daily_attempts" ALTER COLUMN "points" SET DEFAULT 0;

/* The leaderboard reads finished attempts for one date. */
CREATE INDEX IF NOT EXISTS "daily_attempts_date_finished_idx"
  ON "daily_attempts" ("date", "finished");
