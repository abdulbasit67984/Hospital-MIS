# Facility and Configuration Operations

## Purpose

The Facility and Configuration module manages:

- Hospitals, branches, clinics, diagnostic centers, and pharmacies
- Facility hierarchy and authentication eligibility
- Facility-scoped department hierarchy
- Global and facility-scoped configuration
- Sensitive encrypted settings
- Immutable setting history
- Facility-aware authentication
- Durable mutation recovery
- Audit and outbox events
- Cross-instance cache invalidation

## Regional defaults

The baseline seed uses:

| Property | Default |
|---|---|
| Country | Pakistan |
| Country code | PK |
| Currency | PKR |
| Timezone | Asia/Karachi |
| Primary locale | en-PK |
| Additional locale | ur-PK |

All application timestamps remain stored in UTC. The facility timezone is used only for display, interpretation, and facility-local workflows.

## Required setup order

Run commands from the repository root.

### 1. Install and build packages

```bash
pnpm install
pnpm build:packages