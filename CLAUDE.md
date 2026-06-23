# CLAUDE.md — Velora / WTR

> Read this file first. It plus the five docs it links should give you 80–90% of the
> project without scanning the codebase. Only open source files named below.

## What this is

**Velora** (codename **WTR — Waiting-Time Recovery**) helps UK haulage businesses recover
money owed for time drivers spend waiting at loading/unloading sites. It captures wait time,
turns it into a defensible charge backed by an evidence pack (PDF), and bills it.

Monorepo, npm workspaces. Three runnable parts + one shared library:

| Part | Path | Role |
|---|---|---|
| Office web app | `apps/office` | The "brain": jobs, calculation, disputes, contracts, invoicing UI |
| Driver PWA | `apps/driver` | The "sensor": geofenced wait capture, photos, offline sync |
| Core engine | `packages/core` | Pure, I/O-free wait-time → charge calculation (unit-tested) |
| Backend | `supabase` | Postgres schema + RLS + Edge Functions (calc, PDF, analytics, integrations) |

## Read-the-docs map (start here, not the code)

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — system design, data flow, why it's split this way.
- **[PROJECT_MAP.md](PROJECT_MAP.md)** — annotated file tree + "where do I change X?" table.
- **[DATABASE.md](DATABASE.md)** — every table, RLS model, RPC functions.
- **[API_MAP.md](API_MAP.md)** — every Edge Function: route, auth, request/response.
- **[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)** — setup, build, test, common workflows.

The full product spec is [waiting-time-recovery-implementation-spec.md](waiting-time-recovery-implementation-spec.md)
(935 lines, ~12k tokens). **Do not read it whole.** It is the source-of-truth requirements
doc; grep it for a section number (e.g. `1.3` for the calc engine) only when you need
the original spec for a specific feature.

## Conventions (non-negotiable, enforced in code)

- **Money is integer pence.** Never floats for currency. Type alias `Pence = number`.
- **Time is ISO-8601 UTC** in transport and `timestamptz` in DB. Convert to `Europe/London`
  only at display (`formatLondonTime` in the office app).
- **`packages/core` has zero I/O and zero framework imports.** Plain data in, plain data out,
  so it stays exhaustively unit-testable and reusable in both apps. Keep it that way.
- **Multi-tenant.** Every domain row carries `tenant_id`; access is enforced by Postgres RLS
  using `auth_tenant_id()`. Never write a query that crosses tenants from a client.
- **Edge Functions use the `service_role` key server-side only.** It must never reach a client bundle.

## Commands

```bash
npm install                 # install all workspaces (run once)
npm run test:core           # run the core engine test suite (the meaningful tests)
npm run dev   -w apps/office # office web app (Vite)
npm run dev   -w apps/driver # driver PWA (Vite)
npm run build -w apps/office # tsc -b + vite build
```

## Component layout (both apps split into views/components/lib)

Both `App.tsx` files were monoliths; they're now thin shells holding state + handlers and
composing extracted pieces. To change a screen, open its file directly — don't read `App.tsx` whole.

- `apps/office/src/App.tsx` — **738 lines.** State + Supabase handlers only. UI lives in
  `src/views/*` (Dashboard, Jobs, NewJob, Disputes, Contracts, Drivers, Settings + 3 pre-auth
  screens), `src/components/{Sidebar,icons}`, `src/lib/format.ts`.
- `apps/driver/src/App.tsx` — **568 lines.** Geofence state machine + sync logic stays here
  (tightly coupled to refs). Presentational UI is in `src/views/*` (JobsList, ActiveJob,
  SyncStatus + 2 pre-auth screens), `src/components/{MobileNav,icons}`, `src/lib/geo.ts`.

## Never read these (no signal, pure cost)

`node_modules/`, `apps/*/node_modules/`, `apps/*/dist/`, `*.tsbuildinfo`, `package-lock.json`,
`*.png`/`*.svg` assets. These are in [.claudeignore](.claudeignore) and `.gitignore`.
