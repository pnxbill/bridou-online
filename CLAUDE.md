# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```shell
pnpm install
pnpm dev                 # web (:3000) + game server (:3001)
pnpm dev:web             # web only
pnpm dev:server          # game server only (tsx watch)
pnpm test                # every workspace package's tests
pnpm typecheck           # tsc --noEmit for apps/* (packages are typechecked through them)
pnpm build               # server (tsup → apps/server/dist/main.js) then next build
```

Per-package tests (vitest, `test/**/*.test.ts` on the server/engine, `src/**/*.test.ts` on web):

```shell
pnpm --filter @bridou/engine test round.test.ts       # single file (extra args reach vitest)
pnpm --filter @bridou/server test -t 'substring of the test name'
pnpm --filter @bridou/web test
```

Database (optional — only when `DATABASE_URL` is set, see below):

```shell
pnpm --filter @bridou/server db:generate   # drizzle-kit: schema.ts → drizzle/*.sql
pnpm --filter @bridou/server db:migrate    # apply migrations (reads apps/server/.env)
```

CI (`.github/workflows/ci.yml`) runs server typecheck → `pnpm test` → `pnpm build` on every push.
`next build` is what typechecks the web app (it needs `.next/types`), so a green `pnpm build` matters.

## Architecture

pnpm workspace monorepo. The rules of the card game live in a pure engine; everything else is
delivery. `PLAN.md` is the living roadmap (what shipped, what's open) — read it before starting
a feature, update it when one lands.

```
packages/shared     Types + the DomainEvent contract shared by engine, server and web
packages/engine     PURE rules: Deck / Turn / Round / Game — no I/O, no transport, no clock
packages/cards-ui   Vendored CSS-drawn cards + framer-motion fanned hand (from pnxbill/cards-lib)
apps/server         Express + socket.io + SSE delivery layer around the engine
apps/web            Next.js App Router client: DomainEvent reducer + one transport file
```

### The event flow (the spine of the app)

1. A client action goes out over REST (`POST /api/bet`, `/api/play-card`, …).
2. `GameService` (use-case layer) validates seat control and calls into the engine.
3. The engine pushes `DomainEvent`s into an injected `EventPublisher` — it never knows the transport.
4. The server's gateway fans each event to the game's players and tees it to abandonment,
   eviction, history recording and durable-state persistence (`apps/server/src/app.ts`).
5. The client applies events to `GameViewState` through a pure reducer
   (`apps/web/src/features/game/reducer.ts`). State only ever comes back as events; REST
   responses carry no game state (except the `/api/enter-game` snapshot).

Invariants worth preserving:

- **The engine stays pure.** Randomness (`Rng`) and time (`Scheduler`) are constructor-injected,
  so tests play full games deterministically (`ManualScheduler` + `seededRng` in
  `packages/engine/test/helpers.ts`). No `Date.now`, `setTimeout`, `fetch` or logging in the engine.
- **Private events are private.** `cards-dealt`, `opponent-hands`, `bet-requested` and
  `play-requested` carry a player's hand; `isPrivateEvent` in `packages/shared/src/events.ts`
  is the single source of truth and every transport routes them to that player only. Adding a
  hand-bearing event means adding it there.
- **Identity comes only from the verified token.** No route, socket or SSE connection accepts a
  `playerId` in the payload — `requireAuth` puts the verified `PlayerInfo` on the request
  (`apps/server/src/http/auth.ts`). SSE takes `?token=`; no token means spectator (public events,
  no presence).
- **Bots use the same doors as humans.** A bot seat sees only `snapshot()` + `clientPerspective()`
  and acts through `GameService.placeBet` / `playCard`. There is no engine backdoor, which is why
  bots can't cheat by construction.

### Server composition (`apps/server/src/app.ts`)

`createApp(options)` is the only wiring point, and it's how tests get their seams: inject
`tokenVerifier`, `history`/`players`, `gameStore`, or faster `abandonment` timings. Ports live in
`application/ports.ts`, implementations in `infra/`.

- **Transports run side by side.** `CompositeGateway` publishes over socket.io *and* SSE
  (`GET /api/games/:gameId/events`, heartbeat ~20s, monotonic event ids). The client picks one —
  SSE by default, `NEXT_PUBLIC_REALTIME_TRANSPORT=socketio` switches back. socket.io also always
  carries `/voice` WebRTC signaling. `game-flow.e2e.test.ts` runs the whole contract against both;
  keep it that way when touching the wire.
- **Presence → abandonment → bot.** `PresenceTracker` counts connections per (game, player) across
  all transports; on the 1→0 transition `AbandonmentService` debounces 3s, pauses the game for a
  30s grace period (`player-abandoned` with a deadline), then hands the seat to a Monte Carlo bot
  (`bot-took-over`). A returning player reclaims the seat (`player-rejoined`).
- **Persistence is optional and layered.** Without `DATABASE_URL` everything is in memory (fine
  locally). With it: `PostgresGameStateStore` behind `DurableGameRepository` keeps live games
  across restarts — the churning current round is one upserted row, finished rounds written once,
  persisted at settle points (`PERSIST_TRIGGERS`), so a crash replays at most the current trick.
  Separately, `GameHistoryRecorder` appends the full event log and finalizes game/player rows at
  `game-ended` for analytics and the leaderboard. Firebase is auth-only.
- **Lobbies** are 5-char codes; only the leader seats bots or starts. The lobby id becomes the
  game id (so a voice call started while waiting carries into the match).

### Web app (`apps/web`)

- Routes: `/` is a header-free entrance, `/game/[gameId]` is a header-free full-bleed table,
  everything else lives in the `(main)` group with the header (`/mesa/[code]` lobby, `/ranking`).
  `/dev/*` pages are design fixtures driving the *real* components with scripted events
  (`table`, `moments`, `motion`, `edge`, `lobby`, `home`, `cards`) — use them to iterate on visuals
  without a live game.
- `GameClient` owns the loop: reducer + `useGameChannel` + optimistic play, and any rejected action
  or reconnect refetches the `/api/enter-game` snapshot (`resync`).
- Transport lives in exactly one file: `src/lib/realtime.ts`. All HTTP lives in `src/lib/api.ts`
  (it attaches the Firebase ID token itself). `src/lib/config.ts` resolves the game-server URL —
  in the browser it defaults to the page hostname on :3001 so LAN phones reach the dev machine.
- Styling is CSS Modules per feature plus tokens in `app/globals.css`. Design direction is
  "noite de jogo": dark slate + gold, green felt table, mobile-first and portrait-only.
- It's an installable PWA: `app/manifest.ts`, the icons in `public/icons` (rasterized from
  `app/icon.svg`), and a hand-rolled `public/sw.js` registered in production only. The worker
  passes through cross-origin, `/api/*` and `text/event-stream` — realtime must never be cached —
  and `CACHE` is bumped to ship a new one. iOS runs standalone with a translucent status bar, so
  `viewportFit: 'cover'` is on and anything pinned to a screen edge needs `env(safe-area-inset-*)`.
- Workspace packages ship raw TypeScript: `next.config.ts` lists them in `transpilePackages`,
  `tsup.config.ts` lists them in `noExternal`. A new `@bridou/*` package must be added to both.

### Domain vocabulary (Portuguese, kept in code and UI)

`RULES.md` is the full rules reference (deal, betting restriction, trick resolution, scoring, blind
round, table lifecycle, ranking) — read it instead of re-deriving the rules from the engine, and
update it if a rule changes.

13 rounds dealing 1→7→1 cards for 2–7 players. Each player bets how many tricks they'll take;
**trunfo** is the trump card, a **bailador** is someone who missed their bet, **feita/made** is a
trick taken. The last round is **blind**: you see everyone else's cards, not your own (the wire
sends `HIDDEN_CARD` for yours). The mid-game scoreboard pops after round 7. A game counts toward
the ranking (`ranked`) only if no seat was a bot at kickoff — a mid-game bot takeover still counts.

## Deployment

Both halves auto-deploy from `main`, so merging is the release signal: server on Render
(`render.yaml`, `https://bridou-server.onrender.com`), web on Vercel with root `apps/web`,
Postgres on Neon. Server env: `PORT`, `HOST`, `FIREBASE_PROJECT_ID`, `DATABASE_URL`,
`WEB_ORIGINS` (comma-separated CORS allowlist; unset = any origin for local LAN testing).
Web env: see `apps/web/.env.example` — all `NEXT_PUBLIC_*` with working defaults, so the app runs
with zero configuration.
