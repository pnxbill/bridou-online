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
- [ ] Handle players abandoning mid-game (forfeit / bot takeover / game cancellation — needs a rules decision)
- [ ] Configurable game rules (round count, scoring) if we ever want variants — *optional, low priority*

## 2. Backend — Server & API (`apps/server`)

- [x] Thin delivery layer: use-cases (`GameService`, `Queue`) + ports (`GameRepository`, `RealtimeGateway`)
- [x] socket.io gateway translating domain events to the legacy wire protocol (keeps the POC alive during the port)
- [x] Wire-protocol e2e test — **temporary**, delete together with the legacy client
- [ ] Multiple lobbies (create/join by code) instead of the single global queue
- [ ] Evict finished/abandoned games from memory (TTL after `game-ended`)
- [ ] Clean REST API v2 designed for the Next.js client (drop legacy naming quirks like `close-score`)
- [ ] Persistence behind `GameRepository` (Redis or Mongo) so games survive restarts — *optional, after SSE*

## 3. Realtime Transport (socket.io → SSE)

Do this **after** the Next.js port so we never change frontend and transport at the same time.

- [ ] SSE endpoint (`GET /api/games/:id/events`) implementing `RealtimeGateway`, with per-player private event routing
- [ ] Heartbeat comment every ~20s + monotonic event ids
- [ ] Client reconnect strategy: `EventSource` auto-retry + snapshot refetch on reconnect
- [ ] Remove socket.io (server + client dependencies)

## 4. Frontend — Next.js (`apps/web`)

The Qwik app (`src/`) is a POC: port behavior, don't fix it.

- [ ] Scaffold `apps/web` (Next.js App Router, TypeScript, importing `@bridou/shared`)
- [ ] Game state as a pure reducer over `DomainEvent` (replaces `setGameListeners.ts`)
- [ ] Realtime channel hook (`useGameChannel`) wrapping socket.io first, SSE later — one file to swap
- [ ] Pages: home/login, lobby/queue, game table (server component fetches the snapshot, client component applies events)
- [ ] Reconnect flow: refetch `/api/enter-game` snapshot (same pattern the POC uses)
- [ ] Feature parity checklist: bets, hand, table, trunfo, scoreboard, bailadores overlay
- [ ] Delete legacy: Qwik `src/`, `game-server/`, root Qwik deps, wire-protocol e2e test

## 5. Authentication & Security

- [ ] Verify Firebase ID tokens server-side (middleware in `apps/server/http`); stop trusting `playerId` from the request body
- [ ] Replace hardcoded game-master UID list with roles (env config or Firestore)
- [ ] Restrict CORS to the real frontend origin (currently `*`)
- [ ] Move Firebase client config to env vars in the Next.js app

## 6. Design / UX

Full redesign planned — decisions still open.

- [ ] Define visual direction (the current CSS is placeholder POC styling)
- [ ] Design the table layout (players around the table, played cards, turn indicator)
- [ ] Mobile-first pass (the game is played on phones at the table)
- [ ] Reuse or redraw card assets (`public/cards/*.svg`)

## 7. Infra & Tooling

- [ ] CI: run `pnpm test` + typecheck on every push (GitHub Actions)
- [ ] Decide deployment target for server + web (the old `pem/` + `.env.production` setup is stale)
- [ ] Production build pipeline for `apps/server` (currently dev-only via tsx)
- [ ] Remove dead artifacts once legacy is gone: `adaptors/`, `server/`, `types/`, `game*.txt`, `mock.json`
