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
- [x] Stronger bot (Monte Carlo over hidden hands) — slots into the `BotStrategy` port; heuristic kept as `createHeuristicBot`
- [ ] Configurable game rules (round count, scoring) if we ever want variants — *optional, low priority*

## 2. Backend — Server & API (`apps/server`)

- [x] Thin delivery layer: use-cases (`GameService`, `Queue`) + ports (`GameRepository`, `RealtimeGateway`)
- [x] socket.io gateway delivering `DomainEvent`s on the `event` channel (legacy event-name mapping removed with the POC)
- [x] Game-flow e2e pinning the real wire contract (REST + `event` channel + private routing)
- [x] Queue bots: the leader can seat bots (random names, `isBot` flag rendered everywhere); they play from the first move; table capped at 7 seats
- [x] Multiple lobbies (create/join by 5-char code, leader-only bots/start, leave with leadership handoff, 2h TTL sweep); `lobby-updated` event replaces `player-entered-queue`
- [x] Evict finished/abandoned games from memory (TTL after `game-ended`)
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

## 3. Realtime Transport (socket.io + SSE)

Both transports are live side by side: the server publishes through a composite gateway,
and the client picks via `NEXT_PUBLIC_REALTIME_TRANSPORT` (`sse` is the default,
`socketio` switches back) — one flag, no server coordination.

- [x] SSE endpoint (`GET /api/games/:id/events`) implementing `RealtimeGateway`, with per-player private event routing
- [x] Heartbeat comment every ~20s + monotonic event ids
- [x] Client reconnect strategy: `EventSource` auto-retry + snapshot refetch on reconnect
- [x] Transport toggle: `lib/realtime.ts` abstraction on the client, composite gateway on the server; e2e runs against both
- [x] Dual transport kept on purpose: SSE is the default; socket.io stays as an env fallback for game events if SSE misbehaves, and always for `/voice` WebRTC signaling (see §9)

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

**Decided (2026-07-10):** Postgres on **Neon** (app can stay on Render). Live games
stay in memory; durable store is an append-only `DomainEvent` log plus finished
game/player rows — enough for analytics like trump-lead rate. Firebase stays
auth-only (no Firestore for game history).

- [x] Decide what to store: event log + finished games/players; queues/active games/voice stay ephemeral
- [x] Choose the database: Postgres on Neon (`DATABASE_URL`); in-memory history when unset
- [x] Repository ports (`GameHistoryRepository`, `PlayerRepository`) + Drizzle schema/migration
- [x] Persist events continuously and finalize game rows at `game-ended`
- [x] Active-game persistence so games survive server restarts: `DurableGameRepository` (write-through cache) behind `GameRepository`, backed by a `GameStateStore` (Postgres in prod, in-memory for tests). Economical two-table model — the churning current round is one small upserted row (`game_current`), each finished round written once (`game_round_results`); persisted at settle points (bet/trick/scoreboard), so a crash replays at most the current trick. `Game.toState/fromState/resume` rebuild the engine and re-arm dropped timers; abandonment reconciles seat control on reload. (Postgres, not Redis — no extra infra.)
- [ ] Player profile / stats API (unblocked — §6 token verify shipped)
- [ ] Materialized rollups for fast profile queries — *optional, after raw event log*

## 6. Authentication & Security

- [x] Verify Firebase ID tokens server-side (`TokenVerifier` port + jose/JWKS impl, `requireAuth` middleware); identity comes ONLY from the token — `playerId`/`user` removed from every request body. SSE takes `?token=` (no token = spectator: public events only, no presence); socket.io and `/voice` verify the handshake token. Client sends `Authorization: Bearer` automatically and rebuilds SSE connections with a fresh token on reconnect. The `uid` cookie is gone (game snapshot now fetched client-side)
- [x] Replace hardcoded game-master UID list with roles — obsolete: the list died with the legacy POC; leader-only rules (bots/start) are enforced per-lobby against the verified uid
- [x] Restrict CORS to the real frontend origin: `WEB_ORIGINS` env allowlist (unset = local dev, any origin)
- [x] Move Firebase client config to env vars in the Next.js app (all fields overridable, public defaults kept)

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
- [x] Motion pass v2: my card travels from the fan to the table (origin measured on tap, `dealSeq` in the reducer), dealing animation at round start (cards fly in from the table side one by one) — playground at `/dev/motion` driving the real GameTable + reducer with scripted events
- [x] Lobby redesign in the same language (the table filling up as people join) — now at `/mesa/[code]` with the invite panel (code tiles, copy link, WhatsApp, share sheet); fixture at `/dev/lobby`
- [x] Home/login as a proper entrance: night sky + card fan + felt rim rising from the bottom, header-free route, Google/sentar/voltar states (mockup kept at `/dev/home`)
- [x] Edge layouts: compact seats/played cards at 5+ opponents (`data-crowded`), fan + bet bar scale down on narrow phones, HUD/hand shrink on short screens, landscape shows a "gire o celular" overlay (portrait-only decided) — fixture at `/dev/edge` renders the real GameTable at the extremes

## 8. Infra & Tooling

- [x] CI: GitHub Actions running typecheck, all tests and the web build on every push
- [x] Decide deployment target for server + web: server LIVE on Render free (`https://bridou-server.onrender.com`, region virginia, auto-deploy from `feature/revamp`, deployed via API — dashboard repo picker is broken for this account; repo made public so Render can fetch it) + Neon `sa-east-1` (migrated, store smoke-tested). Old pem key removed from the tree but exposed in public history — treat as burned. Web on Vercel still pending (`NEXT_PUBLIC_GAME_SERVER_URL`, then `WEB_ORIGINS` + Firebase authorized domain)
- [x] Production build pipeline for `apps/server` (tsup → `dist/main.js`; `pnpm start` runs `node dist/main.js`)
- [x] Remove dead artifacts: `adaptors/`, `server/`, `types/`, `public/`, root env/eslint/vite configs

## 9. Voice Chat (P2P WebRTC mesh)

Friends talking while they play. Each game is a voice room (2–7 players); audio flows
browser-to-browser, the game server only relays signaling. Off by default — players
opt in with "Entrar na voz", then mute mic / mute audio / leave as they like.

- [x] Shared signaling contract (`VoiceSignal`, `VoicePresence` in `@bridou/shared`)
- [x] Server `/voice` socket.io namespace: roster, peer join/leave, mute broadcast, targeted offer/answer/ICE relay (stamps real `from`); `GET /api/games/:id/voice` for the join-button count
- [x] Client `useVoiceChat`: getUserMedia, full mesh, glare-free negotiation (joiner offers), mute/deafen, teardown on leave/unmount
- [x] `VoiceControls` dock on the game screen and lobby table (join count, mic/audio/leave, roster) — lobby id becomes the game id, so a call started while waiting carries into the match
- [x] Speaking indicators: AnalyserNode VAD → green ring on table avatars / my chip / voice roster
- [x] ICE config ready for TURN (`NEXT_PUBLIC_TURN_*` in `.env.example`); STUN-only by default
- [x] Signaling e2e (`apps/server/test/voice.e2e.test.ts`)
- [ ] TURN relay for players behind symmetric NATs (coturn or a free-tier service) — *follow-up when friends hit connection failures*
- [ ] HTTPS / secure-context story for LAN testing (mic needs `https://` or `localhost`) — *testing concern until production deploy*
- [ ] Optional: speaking glow on the dock only when unmuted and connected (already works); finer VAD tuning if fake-mic / noisy rooms mis-trigger
