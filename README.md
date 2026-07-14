# Hospital Management Information System

Phase 1 establishes the production-oriented pure MERN monorepo foundation for the Hospital MIS.

## Architecture constraints

- MongoDB Community Server runs as a **standalone instance**.
- The application does not require replica sets, Mongoose sessions, native multi-document transactions, or MongoDB change streams.
- Cross-collection consistency will be implemented in Phase 3 through durable application transactions, idempotency records, logical locks, compensation, recovery workers, reconciliation, and a durable outbox.
- MongoDB writes that protect stock, bed occupancy, balances, limits, and sequences will use atomic conditional operations.
- Money will use MongoDB Decimal128, Decimal.js, and decimal strings at API boundaries in later phases.

## Repository layout

```text
hospital-mis/
├── apps/
│   ├── api/       Express REST API and Socket.IO gateway
│   ├── web/       React, Vite, Tailwind application
│   └── worker/    MongoDB-backed background-worker process
├── packages/
│   ├── config/    Environment parsing and validation
│   ├── database/  Standalone MongoDB connection and health probes
│   ├── shared/    API envelopes, logger, shared infrastructure
│   ├── testing/   Shared test helpers
│   ├── types/     Shared TypeScript types
│   ├── ui/        Accessible reusable React components
│   └── validation/Shared Zod schemas
├── infrastructure/
│   ├── docker/
│   └── nginx/
├── scripts/
└── docs/
```

## Prerequisites

- Node.js 22.16.0 or a compatible Node.js release newer than 22.13.0.
- pnpm 11.13.0 through Corepack.
- Docker Engine and Docker Compose for the full local stack.

## Install

```bash
corepack enable
corepack prepare pnpm@11.13.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
```

## Run infrastructure only

```bash
docker compose up -d mongo
```

Then start the applications on the host:

```bash
pnpm dev
```

- Web: `http://localhost:5173`
- API liveness: `http://localhost:4000/api/v1/health`
- API readiness: `http://localhost:4000/api/v1/ready`

## Run the complete Docker stack

```bash
docker compose up --build
```

Open `http://localhost:3000`.

## Quality commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

To verify a running API:

```bash
pnpm verify:running
```

## Health semantics

- `/api/v1/health` is a liveness endpoint and does not contact dependencies.
- `/api/v1/ready` checks standalone MongoDB.
- The worker periodically verifies MongoDB and writes structured heartbeat logs.

## Environment variables

See `.env.example` and `docs/environment.md`. Never commit production secrets.

## Phase status

- Phase 0: approved.
- Phase 1: repository and runtime foundation.
- Phase 2: complete MongoDB data model, validators, indexes, migrations, and seeds.
- Phase 3: authentication, authorization, audit, money, idempotency, logical locks, application transactions, recovery, durable outbox, and jobs.

## Known Phase 1 limitations

- Domain modules are intentionally not implemented yet.
- Authentication and permission enforcement arrive in Phase 3.
- The worker currently performs dependency heartbeats; durable job leasing arrives in Phase 3.
- The Socket.IO gateway only exposes a safe connection acknowledgement.
- Docker execution must be validated on a machine with Docker because Docker is not available in the generation environment.

## Phase 2 database workflow without Docker

Run MongoDB Community Server locally, then use:

```bash
cp .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm db:test
```

See `docs/local-mongodb-setup.md` and `docs/database-design.md`.
