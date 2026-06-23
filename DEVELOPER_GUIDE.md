# DEVELOPER_GUIDE.md — Velora / WTR

## Prerequisites

- Node 20+ (npm workspaces), the **Supabase CLI** (local stack + functions + migrations),
  and Deno (bundled via Supabase CLI for Edge Functions).

## Setup

```bash
npm install                 # installs all workspaces (apps/*, packages/*)
cp .env.example .env        # if present; otherwise set the vars below
```

Client env (Vite) for both apps — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. The office
app also accepts these via the in-app Settings / localStorage (`supabase_url`, `supabase_anon_key`).
`SUPABASE_SERVICE_ROLE_KEY` is for Edge Functions **only** — never put it in client env.

## Run

```bash
npm run dev   -w apps/office   # office web app (Vite dev server)
npm run dev   -w apps/driver   # driver PWA (Vite dev server)
npm run build -w apps/office   # tsc -b && vite build  (output: apps/office/dist — ignored)
npm run lint  -w apps/office   # eslint

# Backend (Supabase CLI, from repo root)
supabase start                 # local Postgres + Auth + Storage
supabase db reset              # apply all migrations to local DB
supabase functions serve <name>
```

## Test

```bash
npm run test:core              # packages/core engine tests — the suite that matters
```

The calculation engine is the only exhaustively tested unit and the place new logic should be
TDD'd. Add a case to `packages/core/tests/engine.test.ts` before changing `src/index.ts`.
The apps have no test suite yet; the engine being pure is what makes the product testable.

## Workflows — keep Claude (and yourself) on the smallest file set

> Read [CLAUDE.md](CLAUDE.md) + the relevant doc first; open code only where the jump table
> in [PROJECT_MAP.md](PROJECT_MAP.md) points.

### Bug fixing
1. Reproduce; identify the layer (engine / app / function / DB) from PROJECT_MAP's jump table.
2. If it's billing math → write a failing test in `engine.test.ts`, then fix `core/src/index.ts`.
3. If it's UI → grep `App.tsx` for the view string / handler; edit the range, don't read the whole file.
4. Run `npm run test:core` and the affected app.

### Feature development
1. Find the original requirement: grep the spec by section number, not full read.
2. Schema first (new migration + RLS) → engine/RPC logic (+ tests) → Edge Function wrapper → UI.
3. Honor invariants: pence ints, UTC, `tenant_id` everywhere, core stays I/O-free.

### Refactoring
- Highest-value refactor: **split `apps/office/src/App.tsx`** into `components/`, `views/`,
  `icons.tsx`, `format.ts`. This is the biggest context-cost reduction available (see audit).
- Don't move calc logic out of `packages/core`; don't add I/O to it.

### Security audits
- Authn/z lives in two places: Edge Function bearer checks and Postgres RLS. Review both.
- Confirm `service_role` never appears in `apps/*` source or bundles.
- `tms-webhook` HMAC is a placeholder — treat as untrusted until hardened.

### Architecture reviews
- Start from [ARCHITECTURE.md](ARCHITECTURE.md). The intended boundary is: pure engine ←
  thin functions ← RLS'd DB ← thin clients. Flag anything that leaks math into functions/UI
  or business rules into clients.

## Gotchas

- Never edit an applied migration — add a new one.
- Two `App.tsx` files are monoliths; prefer grep + ranged reads.
- `node_modules` is hoisted but apps also have nested copies; ignore all of them (see `.claudeignore`).
