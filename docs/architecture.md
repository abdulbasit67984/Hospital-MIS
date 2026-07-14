# Phase 1 Architecture

## Runtime components

1. The React application is built by Vite and served by Nginx in Docker.
2. Nginx proxies REST and Socket.IO traffic to the Express API.
3. Express exposes liveness and readiness endpoints and initializes the Socket.IO gateway.
4. The API connects to standalone MongoDB.
5. The worker connects independently and performs database heartbeats.
6. Later phases add durable job leasing, application transactions, outbox dispatch, and reconciliation without changing the process boundaries.

## Standalone MongoDB policy

`retryWrites` is disabled explicitly. No code in Phase 1 creates a MongoDB session or invokes `withTransaction`. Change streams are not used. Database readiness is based on a direct `ping` command.

## Package boundaries

- `config` owns environment parsing.
- `database` owns Mongoose connection lifecycle.
- `shared` owns cross-process response and logging conventions.
- `validation` owns reusable validation primitives.
- `types` contains dependency-light shared types.
- `ui` contains reusable accessible React elements.
- `testing` contains shared test helpers.

These packages are intentionally small so that Phase 2 and Phase 3 can expand them without coupling domain modules to Express or React.
