-- Migration: Plan 3 Additions
-- Date: 2026-06-13

-- ============================================================================
-- 3.1 Revenue Recovery Analytics additions
-- ============================================================================
alter table public.job 
  add column charge_pence int null check (charge_pence >= 0),
  add column billable_minutes int null check (billable_minutes >= 0);

create index idx_job_analytics on public.job(tenant_id, status, created_at) include (charge_pence, billable_minutes);
create index idx_job_customer_analytics on public.job(tenant_id, customer_id, status) include (charge_pence, billable_minutes);

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

create trigger tg_sync_job_calc_columns before insert or update of calc_result on public.job
  for each row execute function sync_job_calc_columns();

-- ============================================================================
-- 3.2 ROI & Subscription Justification models
-- ============================================================================
create table public.tenant_subscription (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) unique,
  monthly_cost_pence int not null default 19900 check (monthly_cost_pence >= 0),
  currency text not null default 'GBP',
  billing_start_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tg_update_tenant_subscription_updated_at
  before update on public.tenant_subscription for each row execute function update_updated_at_column();

alter table public.tenant_subscription enable row level security;
create policy tenant_sub_isolation on public.tenant_subscription
  using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

-- ============================================================================
-- 3.3 Dispute Management System models
-- ============================================================================
-- Update job status constraints
alter table public.job drop constraint if exists job_status_check;
alter table public.job add constraint job_status_check 
  check (status in ('open','captured','calculated','flagged','invoiced','disputed','under_review','approved','rejected','paid','void'));

create table public.dispute (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  job_id uuid not null references public.job(id) unique,
  status text not null default 'disputed' check (status in ('disputed', 'under_review', 'approved', 'rejected', 'paid')),
  reason text not null,
  internal_notes text null,
  disputed_at timestamptz not null default now(),
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tg_update_dispute_updated_at
  before update on public.dispute for each row execute function update_updated_at_column();

alter table public.dispute enable row level security;
create policy dispute_isolation on public.dispute
  using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

create table public.dispute_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  dispute_id uuid not null references public.dispute(id) on delete cascade,
  from_status text not null,
  to_status text not null,
  changed_by uuid not null references public.app_user(id),
  notes text null,
  changed_at timestamptz not null default now()
);

alter table public.dispute_history enable row level security;
create policy dispute_history_isolation on public.dispute_history
  using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

-- ============================================================================
-- 3.4 Customer Contract Management models
-- ============================================================================
create table public.customer_contract (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  customer_id uuid not null references public.customer(id) on delete cascade,
  label text not null,
  effective_date date not null,
  expiry_date date not null check (expiry_date >= effective_date),
  storage_path text null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tg_update_customer_contract_updated_at
  before update on public.customer_contract for each row execute function update_updated_at_column();

alter table public.customer_contract enable row level security;
create policy contract_isolation on public.customer_contract
  using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

create table public.contract_rule (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  contract_id uuid not null references public.customer_contract(id) on delete cascade,
  vehicle_type_id uuid not null references public.vehicle_type(id) on delete cascade,
  hourly_rate_pence int not null check (hourly_rate_pence >= 0),
  free_time_minutes int not null check (free_time_minutes >= 0),
  free_time_basis text not null check (free_time_basis in ('per_job', 'per_stop')),
  rounding_increment int not null default 15 check (rounding_increment in (1,5,10,15,30,60)),
  rounding_mode text not null default 'up' check (rounding_mode in ('up','exact')),
  daily_cap_pence int null check (daily_cap_pence is null or daily_cap_pence >= 0)
);

alter table public.contract_rule enable row level security;
create policy contract_rule_isolation on public.contract_rule
  using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

-- Overlap trigger logic
create or replace function check_customer_contract_overlap() returns trigger language plpgsql as $$
declare
  overlap_count int;
begin
  select count(*) into overlap_count
  from public.customer_contract
  where customer_id = new.customer_id
    and id <> new.id
    and (new.effective_date, new.expiry_date) overlaps (effective_date, expiry_date);
  if overlap_count > 0 then
    raise exception 'Customer contracts cannot overlap in validity dates';
  end if;
  return new;
end;
$$;

create trigger tg_check_customer_contract_overlap
  before insert or update on public.customer_contract
  for each row execute function check_customer_contract_overlap();

-- ============================================================================
-- 3.5 Driver Behaviour / Audit log additions
-- ============================================================================
create table public.job_stop_modification_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  job_stop_id uuid not null references public.job_stop(id) on delete cascade,
  field_modified text not null,
  old_value text null,
  new_value text null,
  modified_by uuid not null references public.app_user(id),
  modified_at timestamptz not null default now()
);

alter table public.job_stop_modification_log enable row level security;
create policy modification_log_isolation on public.job_stop_modification_log
  using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

-- ============================================================================
-- 3.7 Integrations Framework models
-- ============================================================================
create table public.integration_provider (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  provider_name text not null check (provider_name in ('csv_import', 'mandata_tms', 'samsara_gps')),
  credentials jsonb null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.integration_provider enable row level security;
create policy provider_isolation on public.integration_provider
  using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

create table public.integration_sync_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  provider_id uuid not null references public.integration_provider(id) on delete cascade,
  status text not null check (status in ('success', 'failed', 'partial')),
  records_processed int not null default 0,
  error_details jsonb null,
  synced_at timestamptz not null default now()
);

alter table public.integration_sync_log enable row level security;
create policy sync_log_isolation on public.integration_sync_log
  using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

-- ============================================================================
-- 3.8 Business Metrics & SaaS Operations schema & model
-- ============================================================================
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
  select count(*) into v_tenants from public.tenant;
  select count(*) into v_drivers from public.app_user where role = 'driver';
  select count(*) into v_jobs from public.job;
  select coalesce(sum(charge_pence), 0) into v_charges from public.job;
  select coalesce(sum(charge_pence), 0) into v_invoiced from public.job where status = 'invoiced';
  select coalesce(sum(charge_pence), 0) into v_paid from public.job where status = 'paid';
  select coalesce(sum(monthly_cost_pence), 0) into v_mrr from public.tenant_subscription;

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
