# API_MAP.md — Velora / WTR

Supabase **Edge Functions** (Deno/TypeScript), one folder per function under
`supabase/functions/<name>/index.ts`. Invoke at
`https://<project-ref>.functions.supabase.co/<name>`.

## Shared request contract

Every function (unless noted) follows the same shape:

1. Handle `OPTIONS` (CORS preflight) → `200 ok`.
2. Require `Authorization: Bearer <supabase access token>`; missing ⇒ `401`.
3. Validate the token, then look up `app_user` to get `tenant_id` (and `role`); not found ⇒ `401/403`.
4. Act using the `service_role` client **scoped to that `tenant_id`**. Errors ⇒ JSON `{ error, details? }`.

`service_role` lives only inside these functions — never in a client bundle.

## Functions

| Function | Trigger / input | Auth | Does | Output |
|---|---|---|---|---|
| `calculate-job` | `POST` body `{ jobId }` | Bearer | Loads job + stops + customer rate, runs core `calculate()`, writes `job.calc_result` + `job.status` | `CalcResult` JSON |
| `evidence-pack` | `GET ?jobId=` | Bearer | Renders evidence-pack PDF (pdf-lib): timeline, photos, terms | PDF bytes |
| `ingest-events` | `POST` body `{ events: CaptureEvent[] }` | Bearer (driver) | Persists synced driver telemetry into `event_log` / materialises stops + evidence | per-event sync result |
| `export` | `GET ?from=&to=` | Bearer | Invoice lines for the date range | JSON/CSV export |
| `revenue-analytics` | `POST`/`GET` | Bearer | Calls `get_revenue_analytics(tenant_id)` RPC | analytics JSON |
| `customer-risk` | `POST`/`GET` | Bearer | Calls `get_customer_risk_profiles(tenant_id)` RPC | risk profiles JSON |
| `import-jobs` | `POST` CSV/JSON body | Bearer | Parses + bulk-imports via `import_jobs_json` RPC | import summary |
| `tms-webhook` | `POST ?tenantId=` | `x-tms-signature` (placeholder HMAC) | Inbound external TMS (Mandata); upserts `integration_provider`, logs `integration_sync_log` | ack JSON |

## Notes for changes

- `tms-webhook` is the one function authed by **tenant query param + signature header**, not a
  user bearer token. Its HMAC check is a placeholder — harden before production.
- Calculation logic does **not** live here. `calculate-job` is a thin loader/persister around
  `packages/core`. Change billing math in `packages/core`, not in the function.
- Analytics/risk math lives in SQL RPCs (`...analytics_rpc.sql`); the functions are thin wrappers.
- `import_map.json` in `supabase/functions/` pins Deno import URLs.
