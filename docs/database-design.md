# Phase 2 MongoDB Database Design

The initial database is MongoDB Community Server running as a standalone `mongod`. Docker, replica sets, native multi-document transactions, Mongoose sessions, and change streams are not required.

## Scope

The catalog defines 165 collections across platform, patient, clinical, inpatient, inventory, finance, payer, assistance, consultant, and reporting domains. Every collection has `schemaVersion`, optimistic `version`, timestamps, facility ownership where applicable, a MongoDB JSON Schema validator, and indexes.

## Consistency model

Critical workflows use atomic conditional updates, unique and partial indexes, idempotency records, operation leases, transaction journals, compensating actions, durable outbox events, and reconciliation workers. The design does not claim native transaction isolation.

## Local commands

1. Install and start MongoDB Community Server locally.
2. Copy `.env.example` to `.env` and update `MONGODB_URI` when necessary.
3. Run `pnpm db:migrate`.
4. Run `pnpm db:seed`.
5. Run `pnpm db:test`.

Database reset is deliberately guarded: `ALLOW_DATABASE_RESET=true pnpm db:reset`.

## Money

Persist monetary values as Decimal128, perform Node.js calculations with Decimal.js in Phase 3, and expose money through API strings. PKR is the initial currency.

## History and retention

Clinical versions, audit logs, stock movements, financial ledger entries, queue histories, bed histories, and fund transactions are immutable from normal application workflows. Masters may use soft deletion. Continuously growing histories are referenced rather than embedded.

## Generic schemas

Critical consistency collections have explicit strongly validated schemas. Remaining workflow collections are registered from the complete catalog with common metadata and a bounded `data` payload in this phase. Their domain-specific fields will be promoted into explicit schemas before each Phase 4 module is implemented; no collection or workflow is omitted.
