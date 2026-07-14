# Phase 1 Verification

## Static verification

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Infrastructure verification

```bash
docker compose up -d mongo
docker compose ps
pnpm dev
pnpm verify:running
```

Expected readiness checks:

- `mongodb`: `up`

## Complete stack verification

```bash
docker compose up --build -d
curl --fail http://localhost:3000/api/v1/health
curl --fail http://localhost:3000/api/v1/ready
```

The web foundation dashboard at `http://localhost:3000` should show the API and MongoDB as online.
