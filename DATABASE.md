# DATABASE.md — Velora / WTR

Postgres 15 (Supabase). Source of truth: `supabase/migrations/*.sql`. Add a **new** migration
to change schema — never edit an applied one. All domain tables carry `tenant_id` and are
RLS-isolated. Money columns are `int` pence; timestamps are `timestamptz`.

## Tables by migration

### `20260613000000_init_schema.sql` — Plan 1 core
| Table | Purpose | Key columns |
|---|---|---|
| `tenant` | A haulage business | `name`, `billing_email`, `default_terms_id` |
| `app_user` | Office/driver user | `auth_id`→`auth.users`, `tenant_id`, `role in (owner,office,driver)`, `full_name` |
| `vehicle_type` | Rate dimension | `label`; unique `(tenant_id,label)` |
| `terms_template` | T&Cs for evidence pack | `label`, `body_md` |
| `customer` | Who is billed | `free_time_basis (per_job\|per_stop)`, `free_time_minutes`, `rounding_increment (1/5/10/15/30/60)`, `rounding_mode (up\|exact)`, `daily_cap_pence` |
| `customer_rate` | Rate per vehicle type | `hourly_rate_pence`, optional `free_time_minutes`; unique `(customer_id,vehicle_type_id)` |
| `site` | Geofenced location | `latitude`, `longitude`, `radius_m (50–1000, default 150)` |
| `job` | A delivery job | `reference` (unique per tenant), `driver_id`, `status (open/captured/calculated/flagged/invoiced/void)`, `booking_slot_at`, `calc_result jsonb` |
| `job_stop` | A stop within a job | `sequence`, `arrival_at`, `departure_at`, `booking_slot_at`, `source (manual\|geofence)`; unique `(job_id,sequence)` |
| `evidence_item` | Proof attached to a stop | `kind (photo\|pod_ref\|note)`, `storage_path`, `text_value`, `captured_at` |
| `event_log` | Driver telemetry audit log | raw synced events from the PWA |

### `20260613000001_plan3_additions.sql` — Plan 3 commercial intelligence
| Table | Purpose |
|---|---|
| `tenant_subscription` | SaaS plan/billing state per tenant |
| `dispute` | A contested charge |
| `dispute_history` | Audit trail of dispute state changes |
| `customer_contract` | Contract governing a customer |
| `contract_rule` | Rules within a contract (overlap-checked) |
| `job_stop_modification_log` | Audit of manual edits to stop times |
| `integration_provider` | Configured external integration (e.g. Mandata TMS) |
| `integration_sync_log` | Per-sync result log |
| `saas_ops.platform_snapshot` | Platform-wide ops metrics (separate `saas_ops` schema) |

## RLS model (28 policies)

Tenancy is enforced in the DB, not the client. SQL helper functions (security definer) read
the JWT:

- `auth_tenant_id()` → the caller's `tenant_id` (via `app_user.auth_id = auth.uid()`)
- `auth_user_role()` → `owner | office | driver`
- `auth_app_user_id()` → the caller's `app_user.id`

Policies generally restrict each table to rows where `tenant_id = auth_tenant_id()`, with
role refinements (e.g. drivers see only their assigned jobs). When adding a table, add its
RLS policies in the same migration.

## RPC functions (callable via PostgREST / Edge Functions)

| Function | Migration | Returns / role |
|---|---|---|
| `get_revenue_analytics(p_tenant_id uuid)` | analytics_rpc | Revenue recovery analytics; wrapped by `revenue-analytics` fn |
| `get_customer_risk_profiles(p_tenant_id uuid)` | analytics_rpc | Per-customer risk scoring; wrapped by `customer-risk` fn |
| `import_jobs_json(...)` | analytics_rpc | Bulk job import; used by `import-jobs` fn |
| `generate_platform_snapshot()` | plan3 | `saas_ops` metrics rollup (security definer) |
| `check_customer_contract_overlap()` | plan3 | Trigger: prevent overlapping contracts |
| `sync_job_calc_columns()` | plan3 | Trigger: materialise `calc_result` into queryable columns |
| `update_updated_at_column()` | init | Trigger on every table's `updated_at` |

## Conventions when changing the DB

1. New migration file, timestamp-prefixed, never edit applied ones.
2. New domain table ⇒ `tenant_id` column + `updated_at` trigger + RLS policies.
3. Money `int` (pence), time `timestamptz`, enums via `check` constraints (match existing style).
