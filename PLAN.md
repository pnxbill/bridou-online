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
- [ ] Bot player: strategy port (`decideBet`, `decideCard`) + a baseline bot that makes legal, sensible decisions — plays for abandoned seats
- [ ] Seat control can switch mid-game (human → bot on abandonment, bot → human on rejoin)
- [ ] Configurable game rules (round count, scoring) if we ever want variants — *optional, low priority*

## 2. Backend — Server & API (`apps/server`)

- [x] Thin delivery layer: use-cases (`GameService`, `Queue`) + ports (`GameRepository`, `RealtimeGateway`)
- [x] socket.io gateway delivering `DomainEvent`s on the `event` channel (legacy event-name mapping removed with the POC)
- [x] Game-flow e2e pinning the real wire contract (REST + `event` channel + private routing)
- [ ] Multiple lobbies (create/join by code) instead of the single global queue
- [ ] Evict finished/abandoned games from memory (TTL after `game-ended`)
- [ ] Clean REST API v2 designed for the Next.js client (drop legacy naming quirks like `close-score`)

### Abandonment flow (decided)

When a player disconnects mid-game: the game pauses for a **30-second grace period**,
everyone else is told the player abandoned, and when the timer expires the game resumes
with a **bot playing that seat**. If the player comes back (during grace or later), they
reclaim their seat.

- [ ] Detect abandonment via `ConnectionRegistry` disconnects; start the 30s grace timer (through the `Scheduler` port so it's testable)
- [ ] New domain events: `player-abandoned` (with deadline), `player-rejoined`, `bot-took-over`
- [ ] Pause the game during grace (reject plays/bets, stop turn prompts), resume after
- [ ] Bot acts through the same use-cases as humans (`placeBet`/`playCard`) — no engine backdoors

## 3. Realtime Transport (socket.io → SSE)

Do this **after** the Next.js port so we never change frontend and transport at the same time.

- [ ] SSE endpoint (`GET /api/games/:id/events`) implementing `RealtimeGateway`, with per-player private event routing
- [ ] Heartbeat comment every ~20s + monotonic event ids
- [ ] Client reconnect strategy: `EventSource` auto-retry + snapshot refetch on reconnect
- [ ] Remove socket.io (server + client dependencies)

## 4. Frontend — Next.js (`apps/web`)

The Qwik app (`src/`) is a POC: port behavior, don't fix it.

- [x] Scaffold `apps/web` (Next.js App Router, TypeScript, importing `@bridou/shared`)
- [x] Game state as a pure reducer over `DomainEvent` (replaces `setGameListeners.ts`), unit-tested
- [x] Realtime channel hook (`useGameChannel`) wrapping socket.io first, SSE later — one file to swap
- [x] Pages: home/login, lobby/queue, game table (server component fetches the snapshot, client component applies events)
- [x] Reconnect flow: socket.io auto-reconnect + refetch `/api/enter-game` snapshot; failed actions also resync
- [x] Feature parity verified in a real multi-player game (bets, hand, table, trunfo, scoreboard, bailadores)
- [x] Delete legacy: Qwik `src/`, `game-server/`, root Qwik deps and configs, legacy wire protocol
- [ ] Abandonment UI: "player X left — bot takes over in 30s" countdown, bot badge on the seat, rejoin flow

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

Full redesign planned — decisions still open.

- [ ] Define visual direction (the current CSS is placeholder POC styling)
- [ ] Design the table layout (players around the table, played cards, turn indicator)
- [ ] Mobile-first pass (the game is played on phones at the table)
- [ ] Reuse or redraw card assets (`public/cards/*.svg`)

## 8. Infra & Tooling

- [ ] CI: run `pnpm test` + typecheck on every push (GitHub Actions)
- [ ] Decide deployment target for server + web (the old `pem/` setup is stale — the committed key should be rotated/removed then)
- [ ] Production build pipeline for `apps/server` (currently dev-only via tsx)
- [x] Remove dead artifacts: `adaptors/`, `server/`, `types/`, `public/`, root env/eslint/vite configs
