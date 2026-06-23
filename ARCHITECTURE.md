# ARCHITECTURE.md — Velora / WTR

## One-paragraph model

A driver waits at a customer site. The **driver PWA** detects arrival/departure by geofence
(or the driver taps manually), captures photos, and queues telemetry events offline. Events
sync to the **backend** (Supabase). The **office app** turns a job's stops into a billable
charge via the **core calculation engine**, flags anything that needs human review, generates
an **evidence-pack PDF**, and exports an invoice line. Everything is scoped to one haulage
business (`tenant`) and isolated by Postgres Row-Level Security.

## Components and boundaries

```
            ┌─────────────────┐         ┌─────────────────┐
            │  apps/driver     │         │  apps/office     │
            │  (React PWA)     │         │  (React SPA)     │
            │  geofence,       │         │  jobs, disputes, │
            │  capture, offline│         │  contracts, $$   │
            └───────┬─────────┘         └────────┬────────┘
                    │  ingest-events              │  calculate-job
                    │  (telemetry sync)           │  evidence-pack / export
                    ▼                             ▼  revenue-analytics, customer-risk
            ┌──────────────────────────────────────────────┐
            │            Supabase Edge Functions            │  Deno/TS
            │  (auth check → service_role DB access)        │
            └───────────────────────┬──────────────────────┘
                                    │ uses
                          ┌─────────▼──────────┐
                          │   packages/core     │  pure calc engine
                          │  calculate(JobInput)│  (also imported directly by apps)
                          └─────────┬──────────┘
                                    │
            ┌───────────────────────▼──────────────────────┐
            │      Supabase Postgres 15 + RLS + Storage     │
            │  tenant, job, job_stop, evidence_item, ...    │
            └───────────────────────────────────────────────┘
                                    ▲
                      external TMS  │ tms-webhook / import-jobs
```

## The calculation engine (the heart) — `packages/core/src/index.ts`

Single pure function `calculate(input: JobInput): CalcResult`. Logic order:

1. **Incomplete guard** — any stop missing `arrivalAt`/`departureAt` ⇒ `status: 'incomplete'`, charge 0.
2. **Per-stop on-site minutes** = `floor((departure - arrival) / 60s)`. Departure-before-arrival ⇒ flag.
3. **Clock-start / booking flag** — arrival after booking slot is flagged for review (don't silently claim).
4. **Free time** — subtracted either `per_stop` or `per_job` (`config.freeTimeBasis`).
5. **Rounding** — `roundingMode: 'up'` rounds up to `roundingIncrement` (1/5/10/15/30/60 min); `'exact'` doesn't.
6. **Charge** = `roundedMinutes / 60 * hourlyRatePence`, integer pence.
7. **Daily cap** — if set and exceeded, charge is capped and flagged.
8. **Status** = `flagged` if any review flag, else `calculated`.

Types live in `packages/core/src/types.ts` (`JobInput`, `JobConfig`, `StopInput`, `CalcResult`).
Tests: `packages/core/tests/engine.test.ts`. This module imports nothing with side effects —
keep it that way so it stays exhaustively testable and runs in both browser apps and Edge Functions.

## Data flow: capture → charge → bill

1. **Capture** — driver PWA writes `CaptureEvent`s to IndexedDB (`apps/driver/src/db.ts`),
   syncs every 30s via `ingest-events` → rows in `event_log`, materialised into `job_stop`
   arrival/departure + `evidence_item` photos.
2. **Calculate** — office calls `calculate-job` (jobId) → loads job+stops+customer rate →
   runs core `calculate()` → writes `job.calc_result` (jsonb) and `job.status`.
3. **Evidence** — `evidence-pack` (jobId) renders a PDF with `pdf-lib`: timeline, photos, terms.
4. **Bill** — `export?from=&to=` produces invoice lines for the date range.

## Integrations

- `tms-webhook?tenantId=` — inbound from external TMS (e.g. Mandata); upserts `integration_provider`,
  logs to `integration_sync_log`. Has a placeholder HMAC `x-tms-signature` check.
- `import-jobs` — CSV/JSON bulk job import (`import_jobs_json` RPC).

## Cross-cutting concerns

- **Auth**: Supabase Auth. One `app_user` row per person with `role in (owner, office, driver)`,
  linked to `auth.users`. Every Edge Function: validate bearer token → look up `app_user.tenant_id`
  → act with `service_role` scoped to that tenant.
- **Tenancy/RLS**: `auth_tenant_id()`, `auth_user_role()`, `auth_app_user_id()` SQL helpers back
  28 RLS policies. See [DATABASE.md](DATABASE.md).
- **Money/time invariants**: see [CLAUDE.md](CLAUDE.md) conventions.

## Build phases (per the spec)

Plan 0 (foundations) → Plan 1 (office/web + engine) → Plan 2 (driver PWA) →
Plan 3 (commercial intelligence: disputes, contracts, analytics, risk, integrations, SaaS ops).
Backend for all four plans exists (3 migrations, 8 functions). The **app UIs are the least complete
layer** — office is a single large `App.tsx`, driver is a working but monolithic PWA.
