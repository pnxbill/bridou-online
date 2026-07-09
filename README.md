# Bridou Online

Online multiplayer trick-taking card game (13 rounds of 1→7→1 cards, bets, trunfo, bailadores).

## Architecture

pnpm workspace monorepo. The game rules live in a pure, transport-agnostic engine;
delivery (HTTP + realtime) is a thin layer around it.

```
├── packages/
│   ├── shared/          # Types + the DomainEvent contract (engine ↔ server ↔ future web app)
│   └── engine/          # PURE game rules: Deck, Turn, Round, Game — no I/O, fully unit-tested
├── apps/
│   └── server/          # Delivery layer
│       ├── application/ # Use-cases (GameService, Queue) + ports (GameRepository, RealtimeGateway)
│       ├── infra/       # socket.io gateway, connection registry, in-memory repository
│       └── http/        # Express routes (legacy REST API)
├── src/                 # LEGACY Qwik frontend (POC) — to be replaced by a Next.js app
└── game-server/         # LEGACY backend — superseded by apps/server, kept until the frontend port
```

Key design points:

- The engine emits `DomainEvent`s (`round-started`, `card-played`, …) through an injected
  `EventPublisher`; it never touches sockets. `apps/server/src/infra/socket-io-gateway.ts`
  maps those events to the socket event names the legacy Qwik client understands.
  Swapping socket.io for SSE later means replacing only that gateway.
- Randomness (`Rng`) and time (`Scheduler`) are injected, so tests run full games
  deterministically with seeded shuffles and manual clocks.
- Private events (a player's hand, their bet options) are routed per player via the
  `ConnectionRegistry`; broadcast snapshots never contain hands.

## Development

```shell
pnpm install
pnpm dev:local     # Qwik frontend (:3000) + game server (:3001)
pnpm dev:server    # game server only
pnpm test          # all workspace tests (engine rules + server use-cases + wire-protocol e2e)
```

## Legacy Qwik frontend

The current frontend is a Qwik City POC (`src/`). It talks REST for actions
(`/api/bet`, `/api/play-card`, …) and receives state over socket.io. See
`apps/server/test/wire-protocol.e2e.test.ts` for the exact wire contract it relies on.
