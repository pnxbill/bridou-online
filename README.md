# Bridou Online

Online multiplayer trick-taking card game (13 rounds of 1→7→1 cards, bets, trunfo, bailadores).

## Architecture

pnpm workspace monorepo. The game rules live in a pure, transport-agnostic engine;
delivery (HTTP + realtime) is a thin layer around it.

```
├── packages/
│   ├── shared/          # Types + the DomainEvent contract (engine ↔ server ↔ web)
│   └── engine/          # PURE game rules: Deck, Turn, Round, Game — no I/O, fully unit-tested
└── apps/
    ├── server/          # Delivery layer
    │   ├── application/ # Use-cases (GameService, Queue) + ports (GameRepository, RealtimeGateway)
    │   ├── infra/       # socket.io gateway, connection registry, in-memory repository
    │   └── http/        # Express routes
    └── web/             # Next.js frontend: DomainEvent reducer + useGameChannel (transport in one file)
```

Key design points:

- The engine emits `DomainEvent`s (`round-started`, `card-played`, …) through an injected
  `EventPublisher`; it never touches transports. The server publishes every event over
  **both** transports (composite gateway): socket.io rooms and an SSE stream
  (`GET /api/games/:gameId/events?playerId=…`, heartbeat every 20s). Private events
  (hands, prompts) reach only their owner on either transport.
- The client picks its transport in one place (`apps/web/src/lib/realtime.ts`):
  SSE by default; set `NEXT_PUBLIC_REALTIME_TRANSPORT=socketio` to switch back.
  The game-flow e2e runs against both.
- Client actions go over REST (`/api/bet`, `/api/play-card`, …); state comes back as
  events. Reconnects refetch the `/api/enter-game` snapshot.
- Randomness (`Rng`) and time (`Scheduler`) are injected, so tests run full games
  deterministically with seeded shuffles and manual clocks.
- `apps/server/test/game-flow.e2e.test.ts` pins the wire contract end to end.

## Development

```shell
pnpm install
pnpm dev           # Next.js frontend (:3000) + game server (:3001)
pnpm dev:server    # game server only
pnpm test          # all workspace tests (engine rules + reducer + server + game-flow e2e)
pnpm build         # production build of the web app
```

### Configuration

The web app runs with zero configuration — sensible defaults are built in
(game server on `http://localhost:3001`, SSE transport, the public Firebase config).
To override anything, `cp apps/web/.env.example apps/web/.env.local` and edit;
e.g. `NEXT_PUBLIC_REALTIME_TRANSPORT=socketio` switches the realtime transport back
to sockets. The server side has just `PORT` (defaults to 3001).

See `PLAN.md` for the revamp roadmap and what's still open.
