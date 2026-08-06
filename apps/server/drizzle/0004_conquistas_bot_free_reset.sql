/*
 * Conquistas now only count at bot-free tables, so the numbers earned under the
 * old rule are wiped and everyone starts level.
 *
 * Three tables, because career conquistas are derived, not stored: leaving
 * `player_stats` alone would let a Veterano earned across bot games pop again
 * on the next real one, and `player_rivalries` is what Nêmesis reads.
 *
 * READ BEFORE EDITING: migrate.ts replays every file in this directory on every
 * boot — there is no migrations table. An unguarded DELETE here would therefore
 * erase everyone's conquistas on each restart. The marker row is what makes
 * this run exactly once; to deliberately re-run it, delete the marker:
 *
 *   DELETE FROM data_migrations WHERE id = 'conquistas-bot-free-reset';
 */

CREATE TABLE IF NOT EXISTS "data_migrations" (
  "id" text PRIMARY KEY NOT NULL,
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "data_migrations" WHERE "id" = 'conquistas-bot-free-reset') THEN
    DELETE FROM "player_achievements";
    DELETE FROM "player_stats";
    DELETE FROM "player_rivalries";
    INSERT INTO "data_migrations" ("id") VALUES ('conquistas-bot-free-reset');
  END IF;
END $$;
