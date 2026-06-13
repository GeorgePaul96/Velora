-- Migration: Initial WTR Schema
-- Date: 2026-06-13

-- Helper triggers function
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1.1.1 tenant table
create table tenant (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  billing_email text not null,
  default_terms_id uuid null
);

create trigger tg_update_tenant_updated_at
  before update on tenant for each row execute function update_updated_at_column();

-- 1.1.2 app_user table
create table app_user (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  auth_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','office','driver')),
  full_name text not null
);

create trigger tg_update_app_user_updated_at
  before update on app_user for each row execute function update_updated_at_column();

-- 1.1.3 vehicle_type table
create table vehicle_type (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  label text not null,
  unique (tenant_id, label)
);

create trigger tg_update_vehicle_type_updated_at
  before update on vehicle_type for each row execute function update_updated_at_column();

-- 1.1.7 terms_template table
create table terms_template (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  label text not null,
  body_md text not null
);

create trigger tg_update_terms_template_updated_at
  before update on terms_template for each row execute function update_updated_at_column();

-- Link tenant default_terms_id foreign key
alter table tenant add constraint fk_tenant_default_terms
  foreign key (default_terms_id) references terms_template(id) on delete set null;

-- 1.1.4 customer table
create table customer (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  name text not null,
  free_time_basis text not null check (free_time_basis in ('per_job','per_stop')),
  free_time_minutes int not null check (free_time_minutes >= 0),
  rounding_increment int not null default 15 check (rounding_increment in (1,5,10,15,30,60)),
  rounding_mode text not null default 'up' check (rounding_mode in ('up','exact')),
  daily_cap_pence int null check (daily_cap_pence is null or daily_cap_pence >= 0),
  terms_template_id uuid null references terms_template(id) on delete set null
);

create trigger tg_update_customer_updated_at
  before update on customer for each row execute function update_updated_at_column();

-- 1.1.5 customer_rate table
create table customer_rate (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  customer_id uuid not null references customer(id) on delete cascade,
  vehicle_type_id uuid not null references vehicle_type(id) on delete cascade,
  hourly_rate_pence int not null check (hourly_rate_pence >= 0),
  free_time_minutes int null check (free_time_minutes is null or free_time_minutes >= 0),
  unique (customer_id, vehicle_type_id)
);

create trigger tg_update_customer_rate_updated_at
  before update on customer_rate for each row execute function update_updated_at_column();

-- 1.1.6 site table
create table site (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  customer_id uuid null references customer(id) on delete set null,
  label text not null,
  latitude double precision not null,
  longitude double precision not null,
  radius_m int not null default 150 check (radius_m between 50 and 1000)
);

create trigger tg_update_site_updated_at
  before update on site for each row execute function update_updated_at_column();

-- 1.1.8 job table
create table job (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  customer_id uuid not null references customer(id) on delete cascade,
  vehicle_type_id uuid not null references vehicle_type(id) on delete cascade,
  reference text not null,
  driver_id uuid null references app_user(id) on delete set null,
  status text not null default 'open' check (status in ('open','captured','calculated','flagged','invoiced','void')),
  booking_slot_at timestamptz null,
  calc_result jsonb null,
  unique (tenant_id, reference)
);

create trigger tg_update_job_updated_at
  before update on job for each row execute function update_updated_at_column();

-- 1.1.9 job_stop table
create table job_stop (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  job_id uuid not null references job(id) on delete cascade,
  site_id uuid null references site(id) on delete set null,
  sequence int not null,
  booking_slot_at timestamptz null,
  arrival_at timestamptz null,
  departure_at timestamptz null,
  source text not null default 'manual' check (source in ('manual','geofence')),
  unique (job_id, sequence)
);

create trigger tg_update_job_stop_updated_at
  before update on job_stop for each row execute function update_updated_at_column();

-- 1.1.10 evidence_item table
create table evidence_item (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  job_stop_id uuid not null references job_stop(id) on delete cascade,
  kind text not null check (kind in ('photo','pod_ref','note')),
  storage_path text null,
  text_value text null,
  captured_at timestamptz not null
);

create trigger tg_update_evidence_item_updated_at
  before update on evidence_item for each row execute function update_updated_at_column();

-- Plan 2: event_log table (audit log for driver telemetry sync)
create table event_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  driver_id uuid not null references app_user(id) on delete cascade,
  job_id uuid not null references job(id) on delete cascade,
  stop_sequence int not null,
  type text not null,
  occurred_at timestamptz not null,
  latitude double precision null,
  longitude double precision null,
  accuracy_m double precision null,
  source text not null,
  storage_path text null,
  text_value text null
);

-- RLS Helper functions
create or replace function auth_tenant_id()
returns uuid language sql stable security definer as $$
  select tenant_id from public.app_user where auth_id = auth.uid();
$$;

create or replace function auth_user_role()
returns text language sql stable security definer as $$
  select role from public.app_user where auth_id = auth.uid();
$$;

create or replace function auth_app_user_id()
returns uuid language sql stable security definer as $$
  select id from public.app_user where auth_id = auth.uid();
$$;

-- Enable RLS on all tables
alter table tenant enable row level security;
alter table app_user enable row level security;
alter table vehicle_type enable row level security;
alter table terms_template enable row level security;
alter table customer enable row level security;
alter table customer_rate enable row level security;
alter table site enable row level security;
alter table job enable row level security;
alter table job_stop enable row level security;
alter table evidence_item enable row level security;
alter table event_log enable row level security;

-- Policies

-- tenant:
-- Select: user must belong to the tenant
-- Insert: any authenticated user (needed for onboarding)
-- Update: user must belong to the tenant (only owner/office role)
create policy tenant_select on tenant for select using (id = auth_tenant_id());
create policy tenant_insert on tenant for insert with check (auth.role() = 'authenticated');
create policy tenant_update on tenant for update using (id = auth_tenant_id() and auth_user_role() in ('owner', 'office'));

-- app_user:
-- Select: user reads their own profile or any profile in their tenant
-- Insert: user can insert their own profile
-- Update: user can update their own profile (or owner/office can update tenant profiles)
create policy app_user_select on app_user for select using (tenant_id = auth_tenant_id() or auth_id = auth.uid());
create policy app_user_insert on app_user for insert with check (auth_id = auth.uid());
create policy app_user_update on app_user for update using (auth_id = auth.uid() or (tenant_id = auth_tenant_id() and auth_user_role() in ('owner', 'office')));

-- vehicle_type:
create policy vt_select on vehicle_type for select using (tenant_id = auth_tenant_id());
create policy vt_all on vehicle_type for all using (tenant_id = auth_tenant_id() and auth_user_role() in ('owner', 'office'));

-- terms_template:
create policy tt_select on terms_template for select using (tenant_id = auth_tenant_id());
create policy tt_all on terms_template for all using (tenant_id = auth_tenant_id() and auth_user_role() in ('owner', 'office'));

-- customer:
create policy cust_select on customer for select using (tenant_id = auth_tenant_id());
create policy cust_all on customer for all using (tenant_id = auth_tenant_id() and auth_user_role() in ('owner', 'office'));

-- customer_rate:
create policy rate_select on customer_rate for select using (tenant_id = auth_tenant_id());
create policy rate_all on customer_rate for all using (tenant_id = auth_tenant_id() and auth_user_role() in ('owner', 'office'));

-- site:
create policy site_select on site for select using (tenant_id = auth_tenant_id());
create policy site_all on site for all using (tenant_id = auth_tenant_id() and auth_user_role() in ('owner', 'office'));

-- job:
-- Office/Owners can see and do everything
-- Drivers can read/update only if driver_id matches their public.app_user.id
create policy job_policy on job for all
  using (tenant_id = auth_tenant_id() and (auth_user_role() in ('owner', 'office') or driver_id = auth_app_user_id()))
  with check (tenant_id = auth_tenant_id() and (auth_user_role() in ('owner', 'office') or driver_id = auth_app_user_id()));

-- job_stop:
create policy job_stop_policy on job_stop for all
  using (
    tenant_id = auth_tenant_id() 
    and (
      auth_user_role() in ('owner', 'office') 
      or job_id in (select id from job where driver_id = auth_app_user_id())
    )
  )
  with check (
    tenant_id = auth_tenant_id() 
    and (
      auth_user_role() in ('owner', 'office') 
      or job_id in (select id from job where driver_id = auth_app_user_id())
    )
  );

-- evidence_item:
create policy evidence_item_policy on evidence_item for all
  using (
    tenant_id = auth_tenant_id() 
    and (
      auth_user_role() in ('owner', 'office') 
      or job_stop_id in (
        select js.id from job_stop js
        join job j on j.id = js.job_id
        where j.driver_id = auth_app_user_id()
      )
    )
  )
  with check (
    tenant_id = auth_tenant_id() 
    and (
      auth_user_role() in ('owner', 'office') 
      or job_stop_id in (
        select js.id from job_stop js
        join job j on j.id = js.job_id
        where j.driver_id = auth_app_user_id()
      )
    )
  );

-- event_log:
create policy event_log_policy on event_log for all
  using (tenant_id = auth_tenant_id() and (auth_user_role() in ('owner', 'office') or driver_id = auth_app_user_id()))
  with check (tenant_id = auth_tenant_id() and (auth_user_role() in ('owner', 'office') or driver_id = auth_app_user_id()));
