# Laboratory Module

The Laboratory backend module provides:

- Facility-scoped Laboratory test categories and test catalog
- Test aliases, methods, units, specimen requirements, components, reference ranges, turnaround times, effective periods, department availability, and charge catalog links
- Encounter-linked Laboratory order creation
- Standardized immutable test-definition snapshots on order items
- Routine, urgent, and STAT priorities
- Order acceptance and cancellation
- Billing charge and cancellation requests through the unified billing bridge
- Specimen accessioning and identifiers
- Label printing
- Sample collection and receipt
- Specimen rejection and recollection
- Immutable specimen lifecycle history
- Result entry and typed component values
- Automatic result flags from reference and critical ranges
- Result validation
- Result verification with encrypted immutable snapshots
- Corrected result versions
- Publication and withdrawal
- Critical result notification, escalation, and acknowledgement
- Patient and encounter Laboratory history
- PDF result reports rendered only from immutable published versions
- Optimistic concurrency
- Idempotent mutations
- Operation locks
- Application transactions
- Audit trails
- Minimum-necessary outbox and realtime payloads
- Encrypted compensation snapshots and recovery execution
- Facility and centralized authorization boundaries
- Clinical encounter and patient-history integration
- No direct Laboratory inventory mutation

## Registration

Register the module after authentication, transaction, audit, outbox,
realtime, sequence, canonical-patient, snapshot-crypto, and billing
dependencies are initialized.

```ts
await registerLaboratoryModule(fastify, {
  dependencies: {
    transactionManager,
    audit,
    outbox,
    realtime,
    clock,
    sequence,
    canonicalPatient,
    snapshotCrypto,
    charges,
  },
  authenticate,
  routePrefix: '/api/v1/laboratory',
});