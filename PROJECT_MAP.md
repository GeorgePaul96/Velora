# PROJECT_MAP.md — Velora / WTR

Annotated tree of **source only** (build outputs, `node_modules`, lockfiles omitted — see
[.claudeignore](.claudeignore)). Sizes are bytes / approx tokens for the heavy files.

```
Velora/
├── CLAUDE.md ARCHITECTURE.md PROJECT_MAP.md DATABASE.md API_MAP.md DEVELOPER_GUIDE.md
├── waiting-time-recovery-implementation-spec.md   49 KB ~12k tok  — full spec; GREP, don't read whole
├── package.json                                   npm-workspaces root (apps/*, packages/*)
│
├── packages/core/                  PURE calc engine — no I/O, no framework
│   ├── src/index.ts                3.6 KB  calculate(JobInput): CalcResult  ← the heart
│   ├── src/types.ts                Pence/Minutes, JobInput, JobConfig, CalcResult
│   └── tests/engine.test.ts        7.5 KB  9 tests — the meaningful test suite
│
├── apps/office/   (React 19 + Vite + TS)  the "brain" UI
│   └── src/
│       App.tsx                     738 lines       shell: state + Supabase handlers + composition
│       views/                      Dashboard, Jobs, NewJob, Disputes, Contracts, Drivers,
│                                   Settings + ConnectionSetup, AuthLanding, OnboardingWizard
│       components/                 Sidebar, icons      lib/format.ts  (formatGBP, formatLondonTime)
│       index.css                   12 KB           styling
│
├── apps/driver/   (React 19 PWA)  the "sensor"
│   └── src/
│       App.tsx                     568 lines       shell + geofence state machine + sync logic
│       views/                      JobsList, ActiveJob, SyncStatus + ConnectionSetup, SignIn
│       components/                 MobileNav, icons    lib/geo.ts (haversine, generateUUID)
│       db.ts                       3.7 KB          IndexedDB offline queue (CaptureEvent)
│
└── supabase/
    ├── config.toml                 15 KB  local stack config
    ├── migrations/
    │   ├── ...000_init_schema.sql      12.6 KB  Plan 1 tables + RLS helpers + triggers
    │   ├── ...001_plan3_additions.sql  11.5 KB  disputes, contracts, integrations, saas_ops
    │   └── ...002_analytics_rpc.sql     8.8 KB  get_revenue_analytics / get_customer_risk_profiles / import_jobs_json
    └── functions/   (Deno/TS Edge Functions — see API_MAP.md)
        ├── calculate-job/      recompute a job's charge (uses core engine)
        ├── evidence-pack/      16 KB  render evidence-pack PDF (pdf-lib)
        ├── ingest-events/      driver telemetry sync endpoint
        ├── export/             invoice export for a date range
        ├── revenue-analytics/  wraps get_revenue_analytics RPC
        ├── customer-risk/      wraps get_customer_risk_profiles RPC
        ├── import-jobs/        CSV/JSON bulk import
        └── tms-webhook/        inbound external TMS (Mandata) webhook
```

## "Where do I change X?" — jump table

| Task | File(s) | Notes |
|---|---|---|
| Wait-time → charge math | `packages/core/src/index.ts` (+ `types.ts`) | Pure. Add a test in `tests/engine.test.ts` first. |
| New billing rule / rounding / cap | `packages/core/src/index.ts` | Reflect in `JobConfig`; spec §1.3. |
| Office UI (a screen) | `apps/office/src/views/<Name>View.tsx` | One file per screen; `App.tsx` only wires them. |
| Driver capture screen | `apps/driver/src/views/ActiveJob.tsx` | Presentational; geofence logic is in `App.tsx`. |
| Driver geofence / sync logic | `apps/driver/src/App.tsx`, `db.ts` | State machine `processGeofenceReadings`; sync `triggerSync`. |
| DB schema / new table / column | `supabase/migrations/*.sql` | Add a **new** migration; never edit applied ones. |
| RLS / tenancy rule | `...init_schema.sql` (helpers + policies) | See DATABASE.md. |
| Server endpoint behavior | `supabase/functions/<name>/index.ts` | One folder per function; see API_MAP.md. |
| PDF evidence pack | `supabase/functions/evidence-pack/index.ts` | pdf-lib, largest function. |
| Analytics / risk math | `...002_analytics_rpc.sql` (SQL RPC) | Functions are thin wrappers over these RPCs. |
| Original requirement for a feature | `waiting-time-recovery-implementation-spec.md` | Grep by section number. |

## Reading-cost guidance for agents

- **Cheap, high-signal (read freely):** the 6 docs, `packages/core/**`, `apps/driver/src/db.ts`,
  any single `apps/*/src/views/*` or `components/*`, any single `supabase/functions/*/index.ts`,
  any one migration.
- **Expensive (grep first, read ranges only):** `apps/office/src/App.tsx`, `apps/driver/src/App.tsx`
  (now shells, but still the largest app files), the spec `.md`, `supabase/config.toml`.
- **Never:** anything in [.claudeignore](.claudeignore).
