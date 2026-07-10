# Bridou Online — Revamp Plan

Working branch: `feature/revamp`. Check items off as they land.
Guiding rule: the **engine stays pure**, transport and framework choices stay swappable,
and every step leaves the game playable.

## 1. Backend — Game Engine (`packages/engine`, `packages/shared`)

- [x] pnpm workspace monorepo (`packages/*`, `apps/*`)
- [x] Shared `DomainEvent` contract + snapshot types (`@bridou/shared`)
- [x] Pure engine: Deck / Turn / Round / Game with injected publisher, scheduler, RNG
- [x] Deterministic unit tests for all rules (bets, follow-suit, trick winner, scoring, rotation, full games for 2–7 players)
- [x] Fix fairness/safety bugs found during the port (biased shuffle, hands leaked in broadcasts, fs logging)
- [x] Bot player: strategy port (`decideBet`, `decideCard`) fed only snapshot + own perspective (cannot cheat by construction); heuristic bot beats random seats 93% of the time
- [x] Seat control can switch mid-game (human → bot on abandonment, bot → human on rejoin)
- [ ] Stronger bot (Monte Carlo over hidden hands) — *optional, slots into the `BotStrategy` port*
- [ ] Configurable game rules (round count, scoring) if we ever want variants — *optional, low priority*

## 2. Backend — Server & API (`apps/server`)

- [x] Thin delivery layer: use-cases (`GameService`, `Queue`) + ports (`GameRepository`, `RealtimeGateway`)
- [x] socket.io gateway delivering `DomainEvent`s on the `event` channel (legacy event-name mapping removed with the POC)
- [x] Game-flow e2e pinning the real wire contract (REST + `event` channel + private routing)
- [x] Queue bots: the leader can seat bots (random names, `isBot` flag rendered everywhere); they play from the first move; table capped at 7 seats
- [ ] Multiple lobbies (create/join by code) instead of the single global queue
- [ ] Evict finished/abandoned games from memory (TTL after `game-ended`)
- [ ] Clean REST API v2 designed for the Next.js client (drop legacy naming quirks like `close-score`)

### Abandonment flow (decided)

When a player disconnects mid-game: the game pauses for a **30-second grace period**,
everyone else is told the player abandoned, and when the timer expires the game resumes
with a **bot playing that seat**. If the player comes back (during grace or later), they
reclaim their seat.

- [x] Detect abandonment via `PresenceTracker` (fed by both transports), 3s debounce against blips, 30s grace via the `Scheduler` port
- [x] New domain events: `player-abandoned` (with deadline), `player-rejoined`, `bot-took-over`
- [x] Pause the game during grace (plays/bets rejected), resume on takeover or rejoin
- [x] Bot acts through the same use-cases as humans (`placeBet`/`playCard`) — no engine backdoors

## 3. Realtime Transport (socket.io → SSE)

Both transports are live side by side: the server publishes through a composite gateway,
and the client picks via `NEXT_PUBLIC_REALTIME_TRANSPORT` (`sse` is the default,
`socketio` switches back) — one flag, no server coordination.

- [x] SSE endpoint (`GET /api/games/:id/events`) implementing `RealtimeGateway`, with per-player private event routing
- [x] Heartbeat comment every ~20s + monotonic event ids
- [x] Client reconnect strategy: `EventSource` auto-retry + snapshot refetch on reconnect
- [x] Transport toggle: `lib/realtime.ts` abstraction on the client, composite gateway on the server; e2e runs against both
- [ ] Remove socket.io (server + client dependencies + composite gateway) once SSE has proven itself in real games

## 4. Frontend — Next.js (`apps/web`)

The Qwik app (`src/`) is a POC: port behavior, don't fix it.

- [x] Scaffold `apps/web` (Next.js App Router, TypeScript, importing `@bridou/shared`)
- [x] Game state as a pure reducer over `DomainEvent` (replaces `setGameListeners.ts`), unit-tested
- [x] Realtime channel hook (`useGameChannel`) wrapping socket.io first, SSE later — one file to swap
- [x] Pages: home/login, lobby/queue, game table (server component fetches the snapshot, client component applies events)
- [x] Reconnect flow: socket.io auto-reconnect + refetch `/api/enter-game` snapshot; failed actions also resync
- [x] Feature parity verified in a real multi-player game (bets, hand, table, trunfo, scoreboard, bailadores)
- [x] Delete legacy: Qwik `src/`, `game-server/`, root Qwik deps and configs, legacy wire protocol
- [x] Abandonment UI: pause overlay with live countdown, 🤖 badge on bot seats, rejoin restores the seat

## 5. Data & Persistence

New concern — the old project had no database (mongoose was wired but commented out).
First decide **what actually needs durability**; active games can stay in memory until then.

- [ ] Decide what to store: finished game results, player stats (wins, bailadas, points history), profiles — vs. what stays ephemeral (queues, active games)
- [ ] Choose the database (Postgres / Mongo / Firestore — Firebase is already in the stack, worth weighing)
- [ ] Repository ports for the durable data (same pattern as `GameRepository`; engine stays persistence-free)
- [ ] Persist finished game results + player stats at `game-ended`
- [ ] Active-game persistence (Redis snapshot behind `GameRepository`) so games survive server restarts — *optional, after SSE*
- [ ] Schema/migration tooling if we pick SQL

## 6. Authentication & Security

- [ ] Verify Firebase ID tokens server-side (middleware in `apps/server/http`); stop trusting `playerId` from the request body
- [ ] Replace hardcoded game-master UID list with roles (env config or Firestore)
- [ ] Restrict CORS to the real frontend origin (currently `*`)
- [ ] Move Firebase client config to env vars in the Next.js app

## 7. Design / UX

Direction decided (2026-07-09): **"noite de jogo"** — dark slate + gold + Outfit (the deck's
world), green felt table as the centerpiece, seats arranged around the table, loud & playful
celebrations. Mobile-first: hand and actions in the thumb zone, the table is the screen.

- [x] Card rendering: vendored the user's cards-lib (github.com/pnxbill/cards-lib) as `packages/cards-ui` — CSS-drawn cards + framer-motion fanned hand with drag-to-reorder, tap-to-select, tap-again-to-play; added a `disabled` state for follow-suit dimming; SVG card assets deleted
- [x] Define visual direction (noite de jogo, above)
- [x] Game-table mockup (`/dev/table`): felt/seats/played cards on one shared ellipse, HUD (round + trunfo), my seat on the near rim, betting + playing phases
- [x] Wire the table design into the real game screen (GameTable replaces BetsBar/Table/Trunfo/BetPicker), header-free full-bleed game route
- [x] Motion pass v1: played cards enter from their seat, completed trick pauses 1.5s (server-paced via the engine) then flies to the winner; live "ganhando"/"ganhou" tag (turn-ended now carries winnerId)
- [x] Celebration moments: RoundEndOverlay (BAILOU!/BAILARAM!/NINGUÉM BAILOU with confetti, delayed reveal so the final trick lands first), scoreboard as podium with medals, game-end with crown + champion + confetti (`finished` flag on snapshots), abandoned overlay restyled calm — playground at `/dev/moments`
- [ ] Motion pass v2: my card travels from the fan to the table, dealing animation at round start
- [ ] Lobby redesign in the same language (the table filling up as people join)
- [ ] Home/login as a proper entrance (5-second first impression)
- [ ] Edge layouts: 6–7 seats on small screens, 6–7 card hands on narrow phones, landscape lock or support decision

## 8. Infra & Tooling

- [x] CI: GitHub Actions running typecheck, all tests and the web build on every push
- [ ] Decide deployment target for server + web (the old `pem/` setup is stale — the committed key should be rotated/removed then)
- [ ] Production build pipeline for `apps/server` (currently dev-only via tsx)
- [x] Remove dead artifacts: `adaptors/`, `server/`, `types/`, `public/`, root env/eslint/vite configs
