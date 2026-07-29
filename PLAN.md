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
- [x] Browser-tab favicon: gold spade on a navy squircle (the crowning A♠ of the home fan), `apps/web/src/app/icon.svg` — replaces the leftover Qwik logo; Next App Router serves it automatically
- [x] App chrome unified (`components/AppHeader` + `components/UserMenu`): one fixed glass header — gold wordmark left, avatar right — replacing the last placeholder-styled `.header` in `globals.css`, plus four improvised top bars (home's greeting chip, ranking's "← início" pill, the root-level settings cog that every screen was padding around). Everything lives behind the avatar now: name/photo, Início/Ranking, the preferences (`features/settings/SettingsSections`, extracted from the old cog) and Sair. `variant="floating"` drops the bar for just the menu button on the two full-bleed screens (home, the table). `/ranking` moved into the `(main)` group where it always belonged, and the night sky moved to `body` so every screen shares it

- [x] Haptics on the cards (`features/game/haptics.ts` via `web-haptics`, which drives
  the Vibration API on Android and the hidden switch-label trick on iOS, where
  `navigator.vibrate` has never existed): four distinct buzzes on the fan — light lift
  when you pick a card up to rearrange it, a short hard click when you drop it back in,
  a barely-there tick when you tap to select, and a slap-then-settle when the card lands
  on the table. Owned by `PlayerHand` (the only place a card is touched, so `/diaria` and
  a live game both get it); `cards-ui` just reports pick-up/drop through
  `onCardPickUp`/`onCardDrop`, replacing the vendored `navigator.vibrate(50)` on tap.
  Toggle in the menu preferences ("Vibração"), stored like the sound mute
- [x] Navigation split out of the cog (`components/AppNav` + `components/navigation.ts`): a fixed
  bottom bar — Início / Mesas / Diária / Ranking, plus your face — on every screen but a live
  table. Everywhere you could go used to live behind the settings cog in the header corner, which
  is why the Mão do Dia and Conquistas appeared nowhere on screen and no screen ever said where you
  were. Now the lit tab does (`isActiveTab`, subtree-aware, so the ephemeral `/mesa/[code]` lobby
  doesn't steal `/mesas`), tabs show signed-out (each gated page already sells itself), and the
  avatar sheet keeps only what a cog may mean: your name, Conquistas, the preferences and Sair.
  `/game/[gameId]` and `/diaria` keep the floating pill, whose sheet carries the destinations. The
  entrance dropped its "ver ranking" link and its corner button to the bar

### PWA — installable "add to home screen"

Goal: friends open the Vercel URL once, tap **Add to Home Screen**, and Bridou launches full-screen from a home-screen icon like a native app — no store, no install friction. Branded with the same gold-spade mark as the favicon.

- [x] App icons from the spade mark: `public/icons/icon-{192,512}.png` (any — the favicon's squircle + gold rim) and `icon-maskable-{192,512}.png` (the same spade full-bleed on navy at 80% scale, no rounded corners / gold border, so Android's circle/squircle crop can't clip it). All four are rasterized from `src/app/icon.svg` — the spade paths are read straight out of it, so the mark has one source
- [x] Apple touch icon: `apps/web/src/app/apple-icon.png` (180×180, opaque navy, no alpha — iOS ignores the manifest icons for the home screen)
- [x] Web app manifest via `apps/web/src/app/manifest.ts` → `/manifest.webmanifest` (Next injects the `<link rel="manifest">`): name/short_name, `display: 'standalone'`, `start_url: '/'`, `orientation: 'portrait'`, `lang: 'pt-BR'`, theme + background `#0b1120`, the icon set above
- [x] `metadata.appleWebApp` in `layout.tsx` (`capable`, `statusBarStyle: 'black-translucent'`, `title: 'Bridou'`). Next only emits the standardized `<meta mobile-web-app-capable>` (iOS 16.4+), so the legacy `apple-mobile-web-app-capable` alias is added via `metadata.other`. Translucent means the felt runs under the status bar, so `viewport.viewportFit: 'cover'` is on and the top/bottom `env(safe-area-inset-*)` are now real values — picked up by the header (bar and floating menu button) and the voice dock (the game table already handled its own)
- [x] Service worker (`public/sw.js`, registered client-side by `components/RegisterServiceWorker.tsx`, production only so it can't fight HMR): hand-rolled, no dependency. Cache-first for content-hashed `/_next/static`, network-first for navigations with the cached shell as the offline fallback, and everything else passed straight through — cross-origin, `/api/*` and `text/event-stream` are never touched, so realtime can't be cached. `CACHE = 'bridou-v1'`; bumping it makes activate drop every older cache
- [x] Verified against a production build (`next start`): manifest serves `application/manifest+json` with all icons 200, both capable metas + the 180×180 apple touch icon in the head, worker activated and controlling, only the shell and hashed static assets in the cache (no `/api`), cross-origin calls to the game server unaffected, and the entrance still renders with the server stopped. Maskable crop checked under simulated circle/squircle masks
- [ ] Real add-to-home on an actual Android phone and iPhone: confirm the gold-spade icon, full-screen standalone launch, no clock overlapping the HUD, and a live game from the installed shell
- [ ] Optional: a subtle in-app "adicione à tela inicial" hint (deferred `beforeinstallprompt` on Android; a one-time Safari share-sheet tip on iOS) — only if friends don't discover it on their own

## 8. Infra & Tooling

- [x] CI: GitHub Actions running typecheck, all tests and the web build on every push
- [x] Decide deployment target for server + web: **both LIVE** — server on Render free (`https://bridou-server.onrender.com`, region virginia, deployed via API since the dashboard repo picker is broken for this account; repo made public so Render can fetch it) + Neon `sa-east-1` (migrated, store smoke-tested) + web on Vercel (`https://bridou-web.vercel.app`, root `apps/web`, `NEXT_PUBLIC_GAME_SERVER_URL` set, `WEB_ORIGINS` + Firebase authorized domain wired). Both auto-deploy from **`main`** (`feature/revamp` was merged in; Render + Vercel now build main, so a merge is the release signal). Old pem key removed from the tree but exposed in public history — treat as burned
- [x] Production build pipeline for `apps/server` (tsup → `dist/main.js`; `pnpm start` runs `node dist/main.js`)
- [x] Remove dead artifacts: `adaptors/`, `server/`, `types/`, `public/`, root env/eslint/vite configs

## 10. Engagement & retention

The diagnosis: getting 4 friends to the same table again is a **coordination**
problem, not a motivation one. A lobby code used to live 2h and then the group
evaporated; nothing carried from one night to the next; the full event log was
written and never read; and there was no reason to open the app alone.

- [x] **Conquistas** — 29-entry catalog in `@bridou/shared` (metadata) + rules
  server-side (`achievement-rules.ts`, pure). `AchievementTracker` rides the
  domain-event tee, so the engine stays unaware. Round-scoped ones fire live as
  a public `achievement-unlocked` event; game/career ones land at `game-ended`.
  Insert-once at the repo makes each unlock announce exactly once. Bots never
  earn. Shelf at `/conquistas` with career stats + head-to-head
- [x] **Resenha** — `buildRecap` (pure) replays the persisted event log into a
  shareable recap: superlatives with evidence, the turning-point chart, and the
  unlocks earned that game. Ties hand out *no* award rather than a fake one.
  Public route; `/resenha/[gameId]`, fixture at `/dev/resenha`
- [x] **Mesas persistentes + temporadas** — named groups, permanent codes,
  rolling seasons that crown a champion on lazy rollover (no cron), standings,
  mural, trophy cabinet, and "quem tá on" via `OnlineTracker`. `/mesas`
- [x] **Provocações** — fixed reaction wheel, server-enforced 2s cooldown
- [x] **Mão do Dia** — one hand, same deal for everyone, derived from the date
  alone (seeded RNG + the zero-randomness heuristic bot), so the day's table is
  identical anywhere. You *play* it on the real felt: call the bet, then lead
  and follow all five tricks against the three bots everybody else faced. The
  hand is a pure function of `(date, bet, plays)` — the server stores only
  those three things and replays from the deal on every request, which is what
  makes it verifiable, resumable across devices, and free of any session.
  Responses carry the events the replay emitted, so the client animates the
  bots' replies instead of cutting to the result. Scored against **par**: an
  exhaustive search of every bet and every legal line, so a result reads "12 of
  a possible 15". One attempt/day, streaks, and a spoiler-free share grid.
  `/diaria`, fixture at `/dev/diaria`
- [x] **Pausa deliberada** — any seat can pause the table with no timer; only
  whoever paused (or the leader) resumes. Distinct from the abandonment pause
- [x] **Imersão** — rodada cega as a set piece (dimmed room, spotlit felt,
  opponents' cards lit), time-of-day lighting, opt-in room tone

Deferred, in rough priority order:

- [ ] Push notifications ("a mesa abriu", "temporada acaba domingo", "a Mão do
  Dia chegou", "é sua vez"). Needs VAPID keys + a `sw.js` push handler. This is
  the multiplier on mesas and the daily — without it both rely on the player
  remembering to look
- [ ] Cosmetic unlocks (felts / card backs) tied to conquistas — cheap, since
  the cards are CSS-drawn and `useDeckTheme` already exists
- [ ] Champion's crown carried visibly into the mesa's next game
- [ ] Resenha as a rendered share *image* (currently shares text + link)
- [ ] Mesa-scoped Mão do Dia leaderboard (today it's global)
- [ ] Persist the deliberate pause across a server restart (it's in-memory, so
  a restart resumes the table)

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
