-- Leaderboard eligibility: a game is ranked when it finished with no bot seat
-- and no bot takeover (bot-took-over event) during play.
ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "ranked" boolean DEFAULT false NOT NULL;

-- Backfill finished games from the data we already have. Only ever promotes to
-- true (default is false), so re-running is safe.
UPDATE "games" g
SET "ranked" = true
WHERE g."status" = 'finished'
  AND NOT EXISTS (
    SELECT 1 FROM "game_players" gp
    WHERE gp."game_id" = g."id" AND gp."is_bot"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "game_events" ge
    WHERE ge."game_id" = g."id" AND ge."type" = 'bot-took-over'
  );
