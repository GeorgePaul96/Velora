# Waiting-Time Recovery — Implementation Spec

A build specification written to be executed literally. Each step is imperative, ordered, and stated with its inputs, outputs, and an acceptance check. Two implementation plans:

- **Plan 1 — Office/Web System** (the brain: data, calculation, evidence pack, invoicing).
- **Plan 2 — Driver Mobile App** (the sensor: geofenced capture, photos, offline sync).

Both depend on **Plan 0 — Shared Foundations**. Build order is Plan 0 → Plan 1 → Plan 2, because the office system can be sold and demoed (manual data entry) before the driver app exists.

Working name in this spec: `WTR`.

---

## Plan 0 — Shared Foundations

### 0.1 Stack (fixed choices; swap only with reason)

| Concern | Choice | Reason |
|---|---|---|
| Database + Auth + Storage | Supabase (Postgres 15, Supabase Auth, Supabase Storage) | One service covers DB, auth, file storage, and serverless functions. Matches your existing Supabase experience. |
| Server logic | Supabase Edge Functions (Deno/TypeScript) | Calculation engine and PDF generation run server-side, deterministic, testable. |
| Office web app | React 18 + Vite + TypeScript | Matches your existing React stack. |
| Driver app | React PWA (same toolchain) | No app-store delay for v1. Installable on Android/iOS home screen. |
| PDF generation | `pdf-lib` (TypeScript) | Runs inside an Edge Function. No headless-browser dependency. |
| Money type | integer pence (never floats) | Floating-point money is a defect. All currency is `int` pence. |
| Time type | ISO 8601 UTC strings in transport; `timestamptz` in DB | One timezone (UTC) internally. Convert to Europe/London only at display. |

### 0.2 Repository layout

```
wtr/
  apps/
    office/            # React office web app
    driver/            # React PWA
  packages/
    core/              # Pure calculation engine + types (NO I/O, NO framework)
    contracts/         # Shared TypeScript types for API request/response
  supabase/
    migrations/        # SQL schema migrations
    functions/
      calculate-job/   # Edge function: recompute a job's charge
      evidence-pack/   # Edge function: render evidence-pack PDF
  tests/
```

Rule: `packages/core` imports nothing with side effects. It takes plain data in, returns plain data out. This is so the calculation can be unit-tested exhaustively and reused in both apps without a database.

### 0.3 Environments

1. Create three Supabase projects: `wtr-dev`, `wtr-staging`, `wtr-prod`.
2. Store each project's URL and `anon`/`service_role` keys in `.env.{dev,staging,prod}`.
3. `service_role` key is used ONLY inside Edge Functions, NEVER shipped to either client app.

### 0.4 Identity model

- One `auth.users` row per office user (the haulier's office staff/owner).
- One `auth.users` row per driver (driver signs into the PWA).
- A `tenant` row represents one haulage business. Every other table carries `tenant_id`. All access is scoped to the caller's `tenant_id` via Row-Level Security (see 1.2).

### 0.5 Definition of "done" for any step

A step is done when: (a) its acceptance check passes, (b) it is committed, (c) for any function in `packages/core`, a unit test covers it. No step is "done" because the code exists; it is done because the check passes.

---

## Plan 1 — Office/Web System

### 1.1 Data model

Create these tables in order (foreign keys require parents first). Types are Postgres types. Every table has `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`. Those three are omitted below for brevity but are mandatory on every table.

**Step 1.1.1 — `tenant`**
```
name              text not null
billing_email     text not null
default_terms_id  uuid null   -- FK to terms_template, set later
```

**Step 1.1.2 — `app_user`** (profile row linked to auth.users)
```
tenant_id   uuid not null references tenant(id)
auth_id     uuid not null unique         -- equals auth.users.id
role        text not null check (role in ('owner','office','driver'))
full_name   text not null
```

**Step 1.1.3 — `vehicle_type`** (per-tenant list, e.g. "Artic", "18t", "7.5t")
```
tenant_id   uuid not null references tenant(id)
label       text not null
unique (tenant_id, label)
```

**Step 1.1.4 — `customer`** (the haulier's customer who gets billed)
```
tenant_id            uuid not null references tenant(id)
name                 text not null
free_time_basis      text not null check (free_time_basis in ('per_job','per_stop'))
free_time_minutes    int  not null check (free_time_minutes >= 0)
rounding_increment   int  not null default 15 check (rounding_increment in (1,5,10,15,30,60))
rounding_mode        text not null default 'up' check (rounding_mode in ('up','exact'))
daily_cap_pence      int  null check (daily_cap_pence is null or daily_cap_pence >= 0)
terms_template_id    uuid null references terms_template(id)
```
Note: `free_time_minutes` here is the default. A per-vehicle-type override lives in the next table.

**Step 1.1.5 — `customer_rate`** (rate + optional free-time override, per customer per vehicle type)
```
tenant_id              uuid not null references tenant(id)
customer_id            uuid not null references customer(id)
vehicle_type_id        uuid not null references vehicle_type(id)
hourly_rate_pence      int  not null check (hourly_rate_pence >= 0)
free_time_minutes      int  null   -- if set, overrides customer.free_time_minutes
unique (customer_id, vehicle_type_id)
```

**Step 1.1.6 — `site`** (a delivery/collection location with a geofence)
```
tenant_id     uuid not null references tenant(id)
customer_id   uuid null references customer(id)   -- null = shared/ad-hoc site
label         text not null
latitude      double precision not null
longitude     double precision not null
radius_m      int not null default 150 check (radius_m between 50 and 1000)
```

**Step 1.1.7 — `terms_template`** (the waiting-time clause text the evidence pack cites)
```
tenant_id   uuid not null references tenant(id)
label       text not null
body_md     text not null    -- markdown clause text
```

**Step 1.1.8 — `job`**
```
tenant_id        uuid not null references tenant(id)
customer_id      uuid not null references customer(id)
vehicle_type_id  uuid not null references vehicle_type(id)
reference        text not null              -- haulier's own job/consignment ref
driver_id        uuid null references app_user(id)
status           text not null default 'open'
                 check (status in ('open','captured','calculated','flagged','invoiced','void'))
booking_slot_at  timestamptz null           -- job-level slot if single-stop; else per-stop
calc_result      jsonb null                 -- frozen output of the engine (see 1.3.7)
unique (tenant_id, reference)
```

**Step 1.1.9 — `job_stop`** (one row per site visited within a job)
```
tenant_id        uuid not null references tenant(id)
job_id           uuid not null references job(id) on delete cascade
site_id          uuid null references site(id)
sequence         int not null               -- 1,2,3 order of visit
booking_slot_at  timestamptz null
arrival_at       timestamptz null
departure_at     timestamptz null
source           text not null default 'manual'
                 check (source in ('manual','geofence'))
unique (job_id, sequence)
```

**Step 1.1.10 — `evidence_item`** (a photo or document attached to a stop)
```
tenant_id     uuid not null references tenant(id)
job_stop_id   uuid not null references job_stop(id) on delete cascade
kind          text not null check (kind in ('photo','pod_ref','note'))
storage_path  text null      -- Supabase Storage path for photos
text_value    text null      -- POD reference or note text
captured_at   timestamptz not null
```

**Acceptance check 1.1:** All tables created via migration; `supabase db reset` runs clean; inserting a `job` with a non-existent `customer_id` fails on the foreign key.

### 1.2 Row-Level Security (RLS)

**Step 1.2.1** Enable RLS on every table.

**Step 1.2.2** Define a SQL helper that returns the caller's tenant:
```sql
create function auth_tenant_id() returns uuid language sql stable as $$
  select tenant_id from app_user where auth_id = auth.uid()
$$;
```

**Step 1.2.3** On every tenant-scoped table add the policy:
```sql
create policy tenant_isolation on <table>
  using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());
```

**Step 1.2.4** Add a stricter read policy for `driver` role: a driver may read/update only `job` rows where `driver_id` maps to their `app_user.id`, and only `job_stop`/`evidence_item` under those jobs.

**Acceptance check 1.2:** Signed in as tenant A, a query for tenant B's jobs returns zero rows. A driver querying another driver's job returns zero rows.

### 1.3 Calculation engine (`packages/core`) — the heart of the product

This is a pure function. Wrong or aggressive numbers destroy the haulier's credibility with their own customer, so the engine is deliberately conservative: when in doubt it under-claims and flags for human review rather than over-claiming.

**Step 1.3.1 — Types** (`packages/core/types.ts`)
```ts
type Minutes = number;          // integer
type Pence = number;            // integer

interface StopInput {
  sequence: number;
  bookingSlotAt: string | null; // ISO UTC
  arrivalAt: string | null;     // ISO UTC
  departureAt: string | null;   // ISO UTC
}

interface JobConfig {
  freeTimeBasis: 'per_job' | 'per_stop';
  freeTimeMinutes: Minutes;     // effective value after override resolution
  hourlyRatePence: Pence;
  roundingIncrement: Minutes;   // 1|5|10|15|30|60
  roundingMode: 'up' | 'exact';
  dailyCapPence: Pence | null;
}

interface JobInput {
  stops: StopInput[];
  config: JobConfig;
}

interface CalcResult {
  status: 'calculated' | 'flagged' | 'incomplete';
  flags: string[];                 // human-readable reasons for review
  billableMinutes: Minutes;        // after free time, before rounding
  roundedMinutes: Minutes;
  chargePence: Pence;
  perStop: Array<{
    sequence: number;
    onSiteMinutes: Minutes;
    clockStartAt: string | null;
    billableMinutes: Minutes;
  }>;
  computedAt: string;              // ISO UTC
}
```

**Step 1.3.2 — Resolve effective free time** before calling the engine (done in the Edge Function, 1.4): if a `customer_rate.free_time_minutes` exists for this customer+vehicle_type, use it; else use `customer.free_time_minutes`. Pass the resolved value as `config.freeTimeMinutes`.

**Step 1.3.3 — Guard for incomplete data.** For each stop, if `arrivalAt` or `departureAt` is null → return `{ status:'incomplete', flags:['stop N missing arrival or departure'] }`. Do not compute partial charges.

**Step 1.3.4 — Per-stop on-site time and clock start.** For each stop:
```
clockStart   = bookingSlotAt ? max(arrivalAt, bookingSlotAt) : arrivalAt
onSiteMin    = minutesBetween(arrivalAt, departureAt)        // departure - arrival
billableRaw  = minutesBetween(clockStart, departureAt)       // departure - clockStart
```
If `departureAt < arrivalAt` → flag `'stop N departure before arrival'`, treat billableRaw as 0.

**Step 1.3.5 — Late-arrival flag (credibility rule).** If `bookingSlotAt` is set AND `arrivalAt > bookingSlotAt`, add flag `'stop N: driver arrived after booking slot — review before claiming'`. The job still computes, but `status` becomes `'flagged'`, so the office must consciously approve it. Rationale: claiming waiting time on a job where your own driver was late is how customers learn to reject all your charges.

**Step 1.3.6 — Apply free time by basis.**
```
if basis == 'per_stop':
    billableMinutes = sum over stops of max(0, billableRaw_stop - freeTimeMinutes)
if basis == 'per_job':
    totalBillableRaw = sum over stops of billableRaw_stop
    billableMinutes  = max(0, totalBillableRaw - freeTimeMinutes)   // one allowance for the whole job
```

**Step 1.3.7 — Round and price.**
```
if roundingMode == 'exact':  roundedMinutes = billableMinutes
if roundingMode == 'up':     roundedMinutes = ceil(billableMinutes / roundingIncrement) * roundingIncrement
chargePence = round( (roundedMinutes / 60) * hourlyRatePence )      // round to nearest pence
if dailyCapPence != null and chargePence > dailyCapPence:
    chargePence = dailyCapPence
    flags.push('charge capped at daily cap')
```
If `billableMinutes == 0` → `chargePence = 0`, `status = 'calculated'` (no charge is a valid result, not an error).

**Step 1.3.8 — Final status.** `status = 'flagged'` if any flag was raised that needs human judgement (late arrival, departure-before-arrival, cap applied is informational only and does NOT force flag); otherwise `'calculated'`.

**Step 1.3.9 — Mandatory unit tests.** Write these exact cases; all must pass before the engine is "done":

1. Artic, per_job, 120 free, on-site 90 → charge 0, status calculated.
2. Artic, per_job, 120 free, on-site 200, £50/h, round up 15 → billable 80 → rounded 90 → £75.00.
3. Per_stop, two stops 70 and 50, 60 free each, £40/h, round up 15 → billable (10 + 0)=10 → rounded 15 → £10.00.
4. Booking slot 09:00, arrival 08:30, departure 11:30, 60 free, per_job → clockStart=09:00 → billableRaw=150 → billable 90.
5. Booking slot 09:00, arrival 09:40 (late), departure 12:00 → status flagged, flag contains 'arrived after booking slot'.
6. Missing departure on stop 2 → status incomplete, chargePence absent/0.
7. Daily cap £200, computed £250 → charge £200, flag 'capped'.
8. Departure before arrival → flagged, that stop contributes 0.

**Acceptance check 1.3:** `npm test packages/core` shows 8/8 passing. The function has zero imports from `apps/`, Supabase, or `fs`.

### 1.4 Edge Function: `calculate-job`

**Step 1.4.1** Trigger: HTTP POST `/functions/v1/calculate-job` with body `{ jobId: uuid }`. Auth: caller's JWT; function uses `service_role` internally after verifying the caller's `tenant_id` owns the job.

**Step 1.4.2** Steps inside the function:
1. Load `job`, its `job_stop` rows (ordered by sequence), the `customer`, and the matching `customer_rate` for `(customer_id, vehicle_type_id)`.
2. If no `customer_rate` row exists → return 422 `{ error: 'no_rate_configured' }`. (You cannot price without a rate.)
3. Resolve effective free time (1.3.2) and build `JobConfig`.
4. Build `JobInput.stops` from `job_stop`.
5. Call `core.calculate(jobInput)`.
6. Persist: set `job.calc_result = result`, and `job.status = result.status === 'flagged' ? 'flagged' : 'calculated'`. If incomplete, leave status `'captured'`.
7. Return 200 `{ result }`.

**Acceptance check 1.4:** POSTing a fully-captured job returns a `CalcResult` and the `job.calc_result` column is populated; re-running produces an identical result (determinism).

### 1.5 Edge Function: `evidence-pack`

**Step 1.5.1** Trigger: GET `/functions/v1/evidence-pack?jobId=<uuid>`. Returns `application/pdf`.

**Step 1.5.2** Preconditions: `job.status in ('calculated','flagged','invoiced')`. Else 409.

**Step 1.5.3** Assemble one A4 page (add pages only if photos overflow) with these regions, top to bottom:
1. Header: tenant name, "Waiting Time Statement", job `reference`, customer name, date generated.
2. Charge summary box: total `chargePence` (format as £), billable minutes, rate, free-time allowance applied.
3. Timeline table: one row per stop — site label, booking slot, arrival, departure, on-site time, billable minutes. Times shown in Europe/London.
4. Map pin block: for each stop with a geofenced capture, a static note "GPS-confirmed on site at <lat,lng>" (a rendered static map image is a v1.1 nice-to-have; v1 prints coordinates).
5. Evidence thumbnails: photos from `evidence_item` (kind='photo'), POD references (kind='pod_ref').
6. Terms clause: render `terms_template.body_md` for the customer's template (the contractual basis for the charge).
7. Footer: "Generated by [tenant]. Charged under the above conditions of carriage."

**Step 1.5.4** Fetch photos from Supabase Storage by `storage_path`, downscale to max 1000px before embedding to keep PDF size sane.

**Acceptance check 1.5:** For a calculated multi-stop job with two photos, the function returns a valid PDF that opens in a viewer, shows the correct £ total matching `calc_result.chargePence`, and includes both photos and the clause text.

### 1.6 Invoicing export

**Step 1.6.1** CSV export endpoint: GET `/functions/v1/export?from=<date>&to=<date>` returns one row per `job` with `status in ('calculated','flagged','invoiced')`:
```
reference, customer_name, vehicle_type, billable_minutes, rate_pence, charge_pence, status, computed_at
```
Money columns exported as decimal pounds (pence / 100) for spreadsheet/accounting import.

**Step 1.6.2** Mark-as-invoiced: PATCH `/jobs/:id { status:'invoiced' }`. Allowed only from `calculated` or `flagged` (flagged requires the office to have reviewed — enforce by requiring a body field `acknowledgedFlags: true`).

**Acceptance check 1.6:** Export returns correct decimal pounds; attempting to invoice a `flagged` job without `acknowledgedFlags:true` returns 409.

### 1.7 Office web app (`apps/office`)

Screens, each with explicit states (loading / empty / error / ready):

1. **Auth** — Supabase email magic-link sign-in. On first sign-in with no tenant, run onboarding (1.7.2).
2. **Onboarding wizard** — create tenant; add vehicle types; add first customer (name, free-time basis, free-time minutes, rounding, rate per vehicle type); pick/edit a terms template (ship one default clause pre-filled).
3. **Jobs list** — table of jobs with status chips. Filters: status, customer, date range. Primary action per row: "Calculate" (open jobs), "View pack" (calculated), "Mark invoiced".
4. **Job detail / manual entry** — create a job (reference, customer, vehicle type, driver optional), add stops (site, sequence, booking slot, arrival, departure), attach photos/POD refs manually. Button "Calculate" calls 1.4 and shows the breakdown including any flags in red.
5. **Flag review** — when status is `flagged`, show the flags and an explicit "I've reviewed — approve for invoicing" toggle that sets `acknowledgedFlags`.
6. **Settings** — customers, rates, sites, vehicle types, terms templates.
7. **Dashboard** — single number above the fold: "£X recovered this month" (sum of `charge_pence` where status='invoiced'), plus "£Y pending" (calculated, not yet invoiced). This is the screen that justifies the subscription; build it.

**Acceptance check 1.7:** A new user can, with zero prior data, sign up → onboard → key in one job by hand → calculate → download an evidence pack → mark invoiced → see the £ appear on the dashboard. This full manual loop is the sellable v1, independent of Plan 2.

### 1.8 Plan 1 build sequence (ordered)

1. Supabase project + migrations (1.1) + RLS (1.2). Check 1.1, 1.2.
2. `packages/core` engine + 8 unit tests (1.3). Check 1.3.
3. `calculate-job` function (1.4). Check 1.4.
4. `evidence-pack` function (1.5). Check 1.5.
5. Office app: auth + onboarding + manual job entry + calculate + flag review (1.7 screens 1,2,4,5).
6. Jobs list, export, mark-invoiced, dashboard (1.7 screens 3,7; 1.6). Check 1.6, 1.7.

At end of Plan 1 you have a product you can demo by entering last week's jobs by hand and showing recovered £. Sell to design partners here, before Plan 2.

---

## Plan 2 — Driver Mobile App

Purpose: remove the office's manual entry by capturing arrival/departure automatically and letting the driver attach photos in seconds. The office system already works without it; Plan 2 makes the data effortless and the timestamps defensible.

### 2.1 Approach

- React PWA installable to the home screen. No app store for v1.
- Offline-first: a driver loses signal at sites constantly. All capture works offline and syncs when signal returns.
- Geofence-driven: the app detects entering/leaving a site radius and records timestamps without the driver remembering to tap.

### 2.2 Local store

**Step 2.2.1** Use IndexedDB (via a thin wrapper) with two stores:
- `pendingEvents`: append-only queue of capture events not yet synced.
- `assignedJobs`: jobs assigned to this driver, cached for offline display.

**Step 2.2.2** Event shape (what the driver app records):
```ts
interface CaptureEvent {
  localId: string;            // uuid generated on device
  jobId: string;
  stopSequence: number;
  type: 'arrival' | 'departure' | 'photo' | 'pod_ref' | 'note';
  occurredAt: string;         // ISO UTC, device clock
  lat?: number; lng?: number; accuracyM?: number;
  source: 'geofence' | 'manual';
  photoBlobKey?: string;      // key into a separate IndexedDB blob store
  textValue?: string;
}
```

### 2.3 Geofencing logic

The browser has no true background geofencing, so implement foreground geofencing while the app is open and the driver is on a job, plus a manual fallback.

**Step 2.3.1** When the driver opens a job and taps "Start", request geolocation permission and begin `navigator.geolocation.watchPosition` with `enableHighAccuracy:true`.

**Step 2.3.2** For each position update, for the job's expected stop site, compute Haversine distance to the site centre.
```
inside = distance_m <= site.radius_m
```

**Step 2.3.3 — Debounced enter/exit (no flapping).**
- Maintain per-stop state `outside | entering | inside | leaving`.
- Transition to `inside` only after `inside == true` for ≥ 60 continuous seconds. On that transition, enqueue an `arrival` event with the timestamp of the FIRST reading in that 60s window (not the moment of confirmation), source `geofence`.
- Transition to `outside` only after `inside == false` for ≥ 120 continuous seconds. On that transition, enqueue a `departure` event timestamped at the LAST in-radius reading.
- Ignore readings with `accuracyM > 100` for state transitions (too noisy) but keep them for display.

**Step 2.3.4 — Manual fallback.** Always show big "Arrived" / "Departed" buttons. If the driver taps them, enqueue events with source `manual`. Manual events override geofence events for the same stop+type (last write wins, but keep both in the audit trail server-side).

**Acceptance check 2.3:** Simulate a GPS track that enters a 150m radius, dwells 30 min, leaves. The app enqueues exactly one arrival and one departure with timestamps within ±90s of the true crossing, and does not enqueue extra events if the signal briefly flickers out of radius for <120s.

### 2.4 Capture flow (driver UX)

1. **Today's jobs** — list of `assignedJobs`, each showing customer, site, status.
2. **Job screen** — "Start" begins geofencing for stop 1. Live status: "Waiting to arrive" → "On site, 00:42 elapsed" → "Departed".
3. **Photo button** — opens camera; stores blob locally; enqueues `photo` event with current GPS.
4. **POD reference** — text field for gate/consignment number; enqueues `pod_ref`.
5. **Multi-stop** — "Next stop" advances `stopSequence`.
6. **Sync indicator** — shows count of unsynced events and last sync time.

### 2.5 Sync protocol

**Step 2.5.1** Trigger sync on: app foreground, network-online event, and every 60s while online.

**Step 2.5.2** Sync algorithm:
1. Read all `pendingEvents` ordered by `occurredAt`.
2. Upload any photo blobs to Supabase Storage first; replace `photoBlobKey` with the returned `storage_path`.
3. POST the batch to `/functions/v1/ingest-events` with idempotency: each event carries its `localId`; the server upserts on `localId` so a retried batch never double-inserts.
4. On 200, remove acknowledged events from `pendingEvents`. On failure, keep them and retry next cycle (never drop unsynced data).

**Step 2.5.3** Server `ingest-events` function:
1. Verify caller is a driver assigned to each referenced job (RLS + explicit check).
2. For `arrival`/`departure`: update the matching `job_stop.arrival_at`/`departure_at` and set `source='geofence'` (or 'manual'). Apply last-write-wins by `occurredAt` per (job_stop, type), but write every raw event to an append-only `event_log` table for audit.
3. For `photo`/`pod_ref`/`note`: insert an `evidence_item`.
4. After applying, if the job now has arrival+departure for all stops, call `calculate-job` (1.4) automatically so the office sees a fresh charge without acting.

**Acceptance check 2.5:** Capture a full job offline (airplane mode), re-enable network → within two sync cycles the office app shows the job as `captured`→`calculated` with the geofenced times, the photos, and a charge. Replaying the same batch a second time changes nothing (idempotent).

### 2.6 Permissions and edge cases

1. **Location denied** — app still works fully via manual Arrived/Departed buttons; show a one-line nudge explaining geofencing needs location.
2. **Site has no geofence** (`site_id` null / ad-hoc) — manual buttons only.
3. **Driver forgets to Start** — allow retroactive manual entry of arrival/departure times on the job screen; mark source `manual`; these are the jobs most likely to be flagged on the office side, which is correct.
4. **Clock skew** — device clock is authority for `occurredAt`, but the server stamps a `received_at`; if `occurredAt` is implausible (future, or >24h before received) flag the job for office review.
5. **Battery** — high-accuracy GPS drains battery; stop `watchPosition` automatically when the job's last stop reaches `departure`.

### 2.7 Plan 2 build sequence (ordered)

1. PWA shell + auth + `assignedJobs` fetch + offline cache (2.1, 2.2).
2. Manual Arrived/Departed + photo + POD capture into `pendingEvents` (2.4 without geofencing).
3. Sync protocol + `ingest-events` function with idempotency (2.5). Check 2.5.
4. Foreground geofencing with debounce (2.3). Check 2.3.
5. Edge-case handling + battery stop (2.6).

Build step 2 (manual capture + sync) before step 4 (geofencing): manual capture alone already eliminates most office data entry and is far simpler. Geofencing is an enhancement, not a prerequisite.



---

## Plan 3 — Commercial Intelligence & Revenue Operations

### 3.1 Revenue Recovery Analytics

Purpose: Provide real-time visibility into waiting-time losses and leakage to optimize pricing policies and haulier claim volume.

#### Database additions:
1. Add columns to `job` table to cache calculation details for performant indexing/aggregations:
```sql
alter table job 
  add column charge_pence int null check (charge_pence >= 0),
  add column billable_minutes int null check (billable_minutes >= 0);
create index idx_job_analytics on job(tenant_id, status, created_at) include (charge_pence, billable_minutes);
create index idx_job_customer_analytics on job(tenant_id, customer_id, status) include (charge_pence, billable_minutes);
```
2. Trigger to auto-sync cached columns when `calc_result` is updated:
```sql
create or replace function sync_job_calc_columns() returns trigger language plpgsql as $$
begin
  if new.calc_result is not null then
    new.charge_pence := (new.calc_result->>'chargePence')::int;
    new.billable_minutes := (new.calc_result->>'billableMinutes')::int;
  else
    new.charge_pence := null;
    new.billable_minutes := null;
  end if;
  return new;
end;
$$;
create trigger tg_sync_job_calc_columns before insert or update of calc_result on job
  for each row execute function sync_job_calc_columns();
```

#### Calculation requirements:
Update/create `/functions/v1/revenue-analytics` (HTTP GET, requires auth JWT). Returns:
```json
{
  "recoveredThisMonthPence": 1250000,
  "recoveredYTDPence": 15000000,
  "pendingRecoveryPence": 340000,
  "averageWaitingChargePence": 7500,
  "totalWaitingHoursRecovered": 200,
  "recoveryTrend": [
    { "date": "2026-06-12", "chargePence": 12000, "hours": 2.5 }
  ],
  "customerRankings": [
    { "customerId": "uuid", "customerName": "Acme Logistics", "chargePence": 450000 }
  ]
}
```

#### Dashboard widgets:
1. Top row metrics (4 cards):
   - "Recovered Revenue (This Month)" - HSL-themed currency display.
   - "Recovered YTD" - Sleek grey secondary card.
   - "Pending Recovery" - Amber-themed card for items in `calculated` or `flagged` state.
   - "Average Recovery Value & Hours" - Two inline numbers.
2. Analytics tab:
   - Line chart for revenue trend over time (daily/weekly/monthly).
   - Horizontal bar chart of Top 10 Customers by recovered revenue.

#### Acceptance criteria:
1. Seed 10 jobs across 3 customers with different statuses and timestamps.
2. Query `/functions/v1/revenue-analytics` and verify totals match expected SQL sums exactly.
3. Verify that updating a job's `calc_result` automatically updates `job.charge_pence` via the database trigger.

---

### 3.2 ROI & Subscription Justification

Purpose: Prove value to tenant hauliers to drive subscription retention by demonstrating a clear financial return on investment.

#### Data model:
Create `tenant_subscription` table to track cost:
```sql
create table tenant_subscription (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) unique,
  monthly_cost_pence int not null default 19900 check (monthly_cost_pence >= 0),
  currency text not null default 'GBP',
  billing_start_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table tenant_subscription enable row level security;
create policy tenant_isolation on tenant_subscription using (tenant_id = auth_tenant_id()) with check (tenant_id = auth_tenant_id());
```

#### Calculation logic:
1. `charges_generated`: sum of `charge_pence` where status is `calculated`, `flagged`, `invoiced`.
2. `charges_invoiced`: sum of `charge_pence` where status is `invoiced`.
3. `charges_paid`: sum of `charge_pence` where status is `paid` (or dispute state is `paid`).
4. `monthly_subscription_cost`: fetched from `tenant_subscription.monthly_cost_pence`.
5. `roi_multiplier` = `charges_invoiced` / `monthly_subscription_cost` (in current billing period).
6. `estimated_annual_recovery` = (Recovered Revenue YTD / (current_date - Jan 1st of current year + 1)) * 365.

#### UI requirements:
"ROI Proof" panel in Dashboard:
- Big visual callout: "Your WTR ROI: **21.1x**" (accent colored green/teal).
- Inline statement: "WTR recovered £4,200.00 this month against a subscription cost of £199.00."
- Projections widget: "Estimated Annualized Recovery: £50,400.00".

#### Acceptance criteria:
1. Insert a subscription cost of £199.00 for tenant A.
2. Insert invoiced jobs totaling £3,980.00.
3. Open dashboard and verify the ROI widget displays exactly "20.0x".

---

### 3.3 Dispute Management System

Purpose: Implement a structured workflow for handling disputed waiting-time claims.

#### New tables:
1. Create `dispute` table:
```sql
create table dispute (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  job_id uuid not null references job(id) unique,
  status text not null default 'disputed' check (status in ('disputed', 'under_review', 'approved', 'rejected', 'paid')),
  reason text not null,
  internal_notes text null,
  disputed_at timestamptz not null default now(),
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table dispute enable row level security;
create policy tenant_isolation on dispute using (tenant_id = auth_tenant_id()) with check (tenant_id = auth_tenant_id());
```
2. Create `dispute_history` table for timeline and audit logs:
```sql
create table dispute_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  dispute_id uuid not null references dispute(id) on delete cascade,
  from_status text not null,
  to_status text not null,
  changed_by uuid not null references app_user(id),
  notes text null,
  changed_at timestamptz not null default now()
);
alter table dispute_history enable row level security;
create policy tenant_isolation on dispute_history using (tenant_id = auth_tenant_id()) with check (tenant_id = auth_tenant_id());
```
3. Update `job` table status constraints to allow dispute lifecycle tracking:
```sql
alter table job drop constraint if exists job_status_check;
alter table job add constraint job_status_check check (status in ('open','captured','calculated','flagged','invoiced','disputed','under_review','approved','rejected','paid','void'));
```

#### State transitions:
- User flags job as disputed → Inserts row in `dispute` (status 'disputed') and updates `job.status` to 'disputed'.
- User starts review → Updates `dispute.status` and `job.status` to 'under_review'.
- User completes review → Updates status to 'approved' (customer accepts claim), 'rejected' (customer rejects claim), or 'paid' (revenue received). Sets `resolved_at`.

#### Permissions:
- Office staff and owners can write/update disputes and dispute histories.
- Drivers have read-only access (or no access) to disputes.

#### Acceptance checks:
1. Transitions: Create an invoiced job, transition to `disputed`. Verify a `dispute` record and `dispute_history` log are created.
2. Driver block: Authenticated driver client attempts to write a dispute record. Database returns RLS or check constraint error.

---

### 3.4 Customer Contract Management

Purpose: Manage customer-specific charging rules, effective dates, and contractual waiting-time templates dynamically.

#### Database schema:
1. Create `customer_contract` table:
```sql
create table customer_contract (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  customer_id uuid not null references customer(id),
  label text not null,
  effective_date date not null,
  expiry_date date not null check (expiry_date >= effective_date),
  storage_path text null, -- optional signed contract file path in Supabase Storage
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table customer_contract enable row level security;
create policy tenant_isolation on customer_contract using (tenant_id = auth_tenant_id()) with check (tenant_id = auth_tenant_id());
```
2. Create `contract_rule` table (defines per-vehicle terms inside the contract):
```sql
create table contract_rule (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  contract_id uuid not null references customer_contract(id) on delete cascade,
  vehicle_type_id uuid not null references vehicle_type(id),
  hourly_rate_pence int not null check (hourly_rate_pence >= 0),
  free_time_minutes int not null check (free_time_minutes >= 0),
  free_time_basis text not null check (free_time_basis in ('per_job', 'per_stop')),
  rounding_increment int not null default 15 check (rounding_increment in (1,5,10,15,30,60)),
  rounding_mode text not null default 'up' check (rounding_mode in ('up','exact')),
  daily_cap_pence int null check (daily_cap_pence is null or daily_cap_pence >= 0)
);
alter table contract_rule enable row level security;
create policy tenant_isolation on contract_rule using (tenant_id = auth_tenant_id()) with check (tenant_id = auth_tenant_id());
```

#### File storage requirements:
Upload PDF/Word contracts to a private Supabase Storage bucket named `contracts`. Access is authorized via Edge Functions that check user roles and tenant IDs.

#### Validation rules:
1. A customer cannot have overlapping active contracts. Enforced via DB trigger:
```sql
create or replace function check_contract_overlap() returns trigger language plpgsql as $$
declare
  overlap_count int;
begin
  select count(*) into overlap_count
  from customer_contract
  where customer_id = new.customer_id
    and id <> new.id
    and (effective_date, expiry_date) overlaps (new.effective_date, new.expiry_date);
  if overlap_count > 0 then
    raise exception 'Customer contracts cannot overlap in validity dates';
  end if;
  return new;
end;
$$;
create trigger tg_check_contract_overlap before insert or update on customer_contract
  for each row execute function check_contract_overlap();
```
2. Dynamic Rate Resolver: Update the `calculate-job` edge function. When loading rules:
   - Check if an active `customer_contract` exists for `customer_id` on the `job.booking_slot_at` (or `created_at` if slot is null).
   - If yes, use the rates and parameters in `contract_rule` for the job's `vehicle_type_id`.
   - If no, fallback to the default rates in `customer_rate` / `customer` tables.

#### Acceptance checks:
1. Insert contract A (valid June 1st to June 30th). Attempt to insert contract B (valid June 28th to July 31st) for the same customer. Database must throw overlap exception.
2. Configure a job booking slot on June 15th. Call `calculate-job` with contract A rules configured (e.g. £100/hr) vs default rates (£50/hr). Verify calculation applies the £100/hr rate.

---

### 3.5 Driver Behaviour Analytics

Purpose: Provide reports on GPS compliance, delay patterns, and manual data corrections to improve capture accuracy.

#### Metrics definitions:
1. **Late Arrival Rate**: Percentage of jobs where `arrival_at > booking_slot_at`.
2. **Manual Override Rate**: Percentage of GPS tracking stops where driver recorded check-ins with `source = 'manual'`.
3. **Geofence Bypass Rate**: Percentage of stops where geofence didn't fire due to location being disabled or bypassed, forcing manual entry.
4. **Office Modification Count**: Number of database edits made by office staff to a driver's timestamps.

#### Database requirements:
Log modifications to jobs by office staff using a `job_stop_modification_log` table:
```sql
create table job_stop_modification_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  job_stop_id uuid not null references job_stop(id) on delete cascade,
  field_modified text not null,
  old_value text null,
  new_value text null,
  modified_by uuid not null references app_user(id),
  modified_at timestamptz not null default now()
);
alter table job_stop_modification_log enable row level security;
create policy tenant_isolation on job_stop_modification_log using (tenant_id = auth_tenant_id()) with check (tenant_id = auth_tenant_id());
```

#### Dashboard implementation:
"Driver Analytics" tab in Office App:
- Grid of driver scorecards: shows name, total jobs, manual override count, late arrival percentage, and an operational rating (green/amber/red).
- Exception log list showing details of all jobs where geofence failed or office overrides occurred.

#### Acceptance checks:
1. Create a job stop, update its timestamps as an office user. Verify a record is written to `job_stop_modification_log`.
2. Run the driver scorecard query and verify that a driver with 2 late arrivals out of 10 jobs displays exactly "20% Late Arrival Rate".

---

### 3.6 Customer Risk Intelligence

Purpose: Profile customer locations to identify structural delivery bottlenecks, dispute risks, and revenue capture probability.

#### Scoring algorithms:
1. **Average Wait time (Minutes)**: Mean time spent on site per stop for a customer.
2. **Dispute Rate (%)**: (Jobs Disputed / Jobs Invoiced) * 100.
3. **Payment Speed (Days)**: Average days elapsed between job invoice date and payment date.
4. **Profitability Score (0-100)**: `100 - (Dispute Rate * 0.5 + min(Average Payment Days, 60) * 0.8)`. Higher means low dispute risk and quick payments.
5. **Customer Delay Ranking**: Sort customers by total non-billable wait time (free time consumed).

#### Data structures:
Use views or a materialized query in `/functions/v1/customer-risk` that calculates values in real-time or pulls from a cached summary.

#### Dashboard requirements:
1. "Risk Intelligence" Dashboard Panel:
   - Scatter plot or clean card grid showing customers categorized by risk quadrants:
     - **Low Risk / Profitable** (Green)
     - **High Wait / Profitable** (Blue)
     - **High Dispute / Slow Pay** (Red)
2. Detail metrics list showing each customer's risk metrics, average payment latency, and dispute history.

#### Acceptance checks:
1. Seed customer X (0 disputes, 15 days avg payment) and customer Y (50% disputes, 60 days avg payment).
2. Verify Y's profitability score is significantly lower than X's score.
3. Confirm rankings sort highest wait-time customers first.

---

### 3.7 Integrations Framework

Purpose: Allow clean ingestion of cargo orders from Transport Management Systems (TMS) and telemetry events from telematics providers.

#### Schema additions:
```sql
create table integration_provider (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  provider_name text not null check (provider_name in ('csv_import', 'mandata_tms', 'samsara_gps')),
  credentials jsonb null, -- encrypted API keys or client configs
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table integration_provider enable row level security;
create policy tenant_isolation on integration_provider using (tenant_id = auth_tenant_id()) with check (tenant_id = auth_tenant_id());

create table integration_sync_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  provider_id uuid not null references integration_provider(id) on delete cascade,
  status text not null check (status in ('success', 'failed', 'partial')),
  records_processed int not null default 0,
  error_details jsonb null,
  synced_at timestamptz not null default now()
);
alter table integration_sync_log enable row level security;
create policy tenant_isolation on integration_sync_log using (tenant_id = auth_tenant_id()) with check (tenant_id = auth_tenant_id());
```

#### API design:
1. **CSV Import**: POST `/functions/v1/import-jobs` (multipart form-data CSV). Parsed server-side, validates fields, creates `job` and `job_stop` rows in bulk inside a single transaction.
2. **TMS Webhook**: POST `/functions/v1/tms-webhook` (raw JSON body from TMS). Verifies signature, maps parameters (consignment ref, customer code, stops) into the WTR database.

#### Acceptance checks:
1. Upload a CSV with 5 valid job records and 1 malformed record (missing vehicle type).
2. Verify API returns status 422, logs the specific row failure details in `integration_sync_log`, and commits 0 rows (atomicity).

---

### 3.8 Business Metrics & SaaS Operations

Purpose: Monitor platform-level operational volume, monthly recurring revenue, and driver/tenant growth.

#### Data model:
Create a schema for aggregate platform snapshots (super-admin access only):
```sql
create schema saas_ops;
create table saas_ops.platform_snapshot (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null unique default current_date,
  active_tenants int not null,
  active_drivers int not null,
  jobs_processed int not null,
  total_charges_pence bigint not null,
  total_invoiced_pence bigint not null,
  total_paid_pence bigint not null,
  mrr_pence bigint not null,
  churn_rate double precision not null default 0.0,
  created_at timestamptz not null default now()
);
```

#### Reporting architecture:
A nightly pg_cron job or edge function trigger queries the database to populate the snapshot:
```sql
create or replace function saas_ops.generate_platform_snapshot() returns void language plpgsql security definer as $$
declare
  v_tenants int;
  v_drivers int;
  v_jobs int;
  v_charges bigint;
  v_invoiced bigint;
  v_paid bigint;
  v_mrr bigint;
begin
  select count(*) into v_tenants from tenant;
  select count(*) into v_drivers from app_user where role = 'driver';
  select count(*) into v_jobs from job;
  select coalesce(sum(charge_pence), 0) into v_charges from job;
  select coalesce(sum(charge_pence), 0) into v_invoiced from job where status = 'invoiced';
  select coalesce(sum(charge_pence), 0) into v_paid from job where status = 'paid';
  select coalesce(sum(monthly_cost_pence), 0) into v_mrr from tenant_subscription;

  insert into saas_ops.platform_snapshot 
    (active_tenants, active_drivers, jobs_processed, total_charges_pence, total_invoiced_pence, total_paid_pence, mrr_pence)
  values 
    (v_tenants, v_drivers, v_jobs, v_charges, v_invoiced, v_paid, v_mrr)
  on conflict (snapshot_date) do update set
    active_tenants = excluded.active_tenants,
    active_drivers = excluded.active_drivers,
    jobs_processed = excluded.jobs_processed,
    total_charges_pence = excluded.total_charges_pence,
    total_invoiced_pence = excluded.total_invoiced_pence,
    total_paid_pence = excluded.total_paid_pence,
    mrr_pence = excluded.mrr_pence;
end;
$$;
```

#### Dashboard requirements:
A separate Admin Console screen (accessible only to users with role='superadmin') displaying:
- Global active tenants, total MRR, and platform-wide waiting revenue processed.

#### Acceptance checks:
1. Run `select saas_ops.generate_platform_snapshot()`.
2. Query `saas_ops.platform_snapshot` and confirm numbers accurately match platform totals.

---

### 3.9 Product Assumptions & Validation Framework

Purpose: Document and test early-stage business hypotheses through targeted validation loops.

#### Core Business Assumptions:

| Assumption | Hypothesis | Validation Method | Metric / Threshold | Failure Action |
|---|---|---|---|---|
| A1: Revenue Loss | Hauliers lose >£1,000/month per 10 trucks in unrecovered waiting time. | 20 structured interviews with transport managers. | ≥ 5 companies confirm losses >£1,000/month and lack of automated tools. | Pivot tool toward different carrier type or adjust pricing down. |
| A2: Driver Capture | Drivers will use the PWA and trigger geofences without high drop-offs. | Deploy PWA to 3 beta drivers for 1 week. | ≥ 90% of site arrivals/departures are captured automatically (accuracy check). | Simplify PWA UI, add persistent notification reminders or shift focus to manual check-ins. |
| A3: Customer Payout | Customers will pay waiting charges if backed by GPS coordinates/photos. | Hauliers send 10 disputed claims using WTR Evidence Packs. | ≥ 70% of claims are settled positively within 30 days. | Redesign the evidence-pack layout, expand legal template clauses, or offer mediation export tools. |

#### Kill Criteria:
If, after 30 days of beta testing with 5 haulage companies, the average positive claim settlement rate is below 40% despite providing evidence logs, the core commercial product assumption is invalidated. Development will pause to reassess business model pivot.

---

### 3.10 Competitive Moat & Data Strategy

Purpose: Leverage aggregated delay and site detention records to create proprietary data products and defensibility.

#### Data Aggregation & Privacy Strategy:
1. **Anonymization Engine**: A weekly background job processes completed jobs and exports waiting times to a global benchmark database.
2. **Privacy Constraint**: Remove all tenant, driver, vehicle plate, customer name, and specific job reference fields. Group delays by Site Lat/Lng (rounded to 3 decimal places to anonymize location exactness) or postal sector.
3. **Minimum Density Rule**: A site/postal sector benchmark is only generated if it contains events from at least 5 distinct tenants. This prevents leak of private transport operator data.

#### Monetization Opportunities:
1. **Warehouse Detention Index**: Sell delay ratings of logistics parks to carriers so they can build waiting-time surcharges directly into their primary freight pricing.
2. **Carrier Premium Benchmarking**: Allow tenants to compare their wait times at a specific location against national/sector averages to optimize route planning.

---

## Cross-cutting acceptance test (the only one that matters commercially)

A design-partner haulier installs the driver PWA on one driver's phone. The driver runs a normal day. With zero office data entry, by end of day the office dashboard shows that day's jobs, each with geofenced arrival/departure, photos, a defensible waiting-time charge, and a downloadable evidence pack carrying the haulier's own clause — and the late-arrival jobs are flagged, not auto-claimed. If that holds across one real week for two partners, the product is real. If it doesn't, the failure will be in capture discipline or the relationship/willingness-to-bill question — neither of which more code fixes.

---

## Build-order summary

```
Plan 0  Foundations        → Supabase, repo, RLS, env
Plan 1  Office system      → engine (core) → calculate-job → evidence-pack
                             → office app manual loop → export/dashboard   [SELLABLE]
Plan 2  Driver app         → PWA shell → manual capture + sync
                             → geofencing → edge cases                     [EFFORTLESS DATA]
Plan 3  Commercial Intel   → Analytics & ROI → Disputes & Contracts
                             → Driver & Risk Analytics → Integrations      [REVENUE OPERATIONS]
```

Note on legality: ship a default `terms_template` waiting-time clause, but have it reviewed by a transport solicitor before relying on it — the engine produces a number, the clause is what makes the number collectable, and that is a legal artefact, not a software one.

