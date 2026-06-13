-- Migration: Analytics & Risk RPC functions
-- Date: 2026-06-13

create or replace function public.get_revenue_analytics(p_tenant_id uuid)
returns json language plpgsql security definer as $$
declare
  v_recovered_month bigint;
  v_recovered_ytd bigint;
  v_pending bigint;
  v_avg_charge bigint;
  v_total_hours double precision;
  v_trend json;
  v_rankings json;
begin
  -- Recovered this month
  select coalesce(sum(charge_pence), 0) into v_recovered_month
  from public.job
  where tenant_id = p_tenant_id 
    and status in ('invoiced', 'paid', 'approved') 
    and created_at >= date_trunc('month', now());

  -- Recovered YTD
  select coalesce(sum(charge_pence), 0) into v_recovered_ytd
  from public.job
  where tenant_id = p_tenant_id 
    and status in ('invoiced', 'paid', 'approved') 
    and created_at >= date_trunc('year', now());

  -- Pending recovery
  select coalesce(sum(charge_pence), 0) into v_pending
  from public.job
  where tenant_id = p_tenant_id 
    and status in ('calculated', 'flagged');

  -- Average waiting charge
  select coalesce(avg(charge_pence), 0)::bigint into v_avg_charge
  from public.job
  where tenant_id = p_tenant_id 
    and status in ('calculated', 'flagged', 'invoiced', 'paid', 'approved', 'under_review') 
    and charge_pence > 0;

  -- Total hours recovered
  select coalesce(sum(billable_minutes), 0) / 60.0 into v_total_hours
  from public.job
  where tenant_id = p_tenant_id 
    and status in ('invoiced', 'paid', 'approved') 
    and charge_pence > 0;

  -- Recovery trend (last 30 days)
  select json_agg(t) into v_trend
  from (
    select d.date::text as date,
           coalesce(sum(j.charge_pence), 0)::bigint as charge_pence,
           coalesce(sum(j.billable_minutes), 0) / 60.0 as hours
    from generate_series(current_date - interval '29 days', current_date, '1 day'::interval) d(date)
    left join public.job j on j.created_at::date = d.date::date and j.tenant_id = p_tenant_id and j.status in ('invoiced', 'paid', 'approved')
    group by d.date
    order by d.date asc
  ) t;

  -- Customer Rankings
  select json_agg(r) into v_rankings
  from (
    select c.id as customer_id, c.name as customer_name, sum(j.charge_pence)::bigint as charge_pence
    from public.job j
    join public.customer c on c.id = j.customer_id
    where j.tenant_id = p_tenant_id and j.status in ('invoiced', 'paid', 'approved')
    group by c.id, c.name
    order by charge_pence desc
    limit 10
  ) r;

  return json_build_object(
    'recoveredThisMonthPence', v_recovered_month,
    'recoveredYTDPence', v_recovered_ytd,
    'pendingRecoveryPence', v_pending,
    'averageWaitingChargePence', v_avg_charge,
    'totalWaitingHoursRecovered', round(v_total_hours::numeric, 2),
    'recoveryTrend', coalesce(v_trend, '[]'::json),
    'customerRankings', coalesce(v_rankings, '[]'::json)
  );
end;
$$;

create or replace function public.get_customer_risk_profiles(p_tenant_id uuid)
returns json language plpgsql security definer as $$
declare
  v_result json;
begin
  select json_agg(row_to_json(r)) into v_result
  from (
    select 
      c.id as customer_id,
      c.name as customer_name,
      coalesce(round(avg(extract(epoch from (js.departure_at - js.arrival_at))/60))::int, 0) as average_wait_minutes,
      coalesce(round(avg(j.charge_pence))::int, 0) as average_claim_pence,
      
      -- Dispute rate = count(disputes) / count(invoiced/completed jobs)
      round(
        coalesce(
          (count(d.id)::double precision / nullif(count(j.id) filter (where j.status in ('invoiced', 'disputed', 'paid', 'approved', 'under_review', 'rejected')), 0)) * 100, 
          0
        )::numeric, 
        1
      )::double precision as dispute_rate,

      -- Payment speed
      coalesce(
        round(avg(extract(epoch from (d.resolved_at - d.disputed_at))/86400))::int,
        15
      ) as payment_speed_days,

      -- Acceptance rate
      round(
        coalesce(
          (count(d.id) filter (where d.status in ('approved', 'paid'))::double precision / nullif(count(d.id), 0)) * 100,
          100
        )::numeric,
        1
      )::double precision as claim_acceptance_rate,

      -- Scores: Risk & Profitability
      round(
        (
          coalesce(
            (count(d.id)::double precision / nullif(count(j.id) filter (where j.status in ('invoiced', 'disputed', 'paid', 'approved', 'under_review', 'rejected')), 0)) * 100, 
            0
          ) * 0.5 + 
          least(
            coalesce(round(avg(extract(epoch from (d.resolved_at - d.disputed_at))/86400))::int, 15), 
            60
          ) * 0.8
        )::numeric,
        1
      )::double precision as risk_score,

      round(
        (
          100.0 - (
            coalesce(
              (count(d.id)::double precision / nullif(count(j.id) filter (where j.status in ('invoiced', 'disputed', 'paid', 'approved', 'under_review', 'rejected')), 0)) * 100, 
              0
            ) * 0.5 + 
            least(
              coalesce(round(avg(extract(epoch from (d.resolved_at - d.disputed_at))/86400))::int, 15), 
              60
            ) * 0.8
          )
        )::numeric,
        1
      )::double precision as profitability_score
    from public.customer c
    left join public.job j on j.customer_id = c.id and j.tenant_id = p_tenant_id
    left join public.job_stop js on js.job_id = j.id and js.arrival_at is not null and js.departure_at is not null
    left join public.dispute d on d.job_id = j.id
    where c.tenant_id = p_tenant_id
    group by c.id, c.name
  ) r;

  return coalesce(v_result, '[]'::json);
end;
$$;

create or replace function public.import_jobs_json(
  p_tenant_id uuid,
  p_provider_id uuid,
  p_jobs_data jsonb
)
returns json language plpgsql security definer as $$
declare
  v_job_record jsonb;
  v_stop_record jsonb;
  v_customer_id uuid;
  v_vehicle_type_id uuid;
  v_site_id uuid;
  v_job_id uuid;
  v_count_jobs int := 0;
begin
  for v_job_record in select * from jsonb_array_elements(p_jobs_data) loop
    -- 1. Find or create customer
    select id into v_customer_id
    from public.customer
    where tenant_id = p_tenant_id and name = (v_job_record->>'customerName')
    limit 1;

    if v_customer_id is null then
      insert into public.customer (tenant_id, name, free_time_basis, free_time_minutes)
      values (p_tenant_id, v_job_record->>'customerName', 'per_job', 60)
      returning id into v_customer_id;
    end if;

    -- 2. Find vehicle type
    select id into v_vehicle_type_id
    from public.vehicle_type
    where tenant_id = p_tenant_id and label = (v_job_record->>'vehicleType')
    limit 1;

    if v_vehicle_type_id is null then
      raise exception 'Vehicle type % not found for this tenant', v_job_record->>'vehicleType';
    end if;

    -- 3. Insert job
    insert into public.job (tenant_id, customer_id, vehicle_type_id, reference, status)
    values (p_tenant_id, v_customer_id, v_vehicle_type_id, v_job_record->>'reference', 'open')
    on conflict (tenant_id, reference) do update set
      customer_id = excluded.customer_id,
      vehicle_type_id = excluded.vehicle_type_id
    returning id into v_job_id;

    v_count_jobs := v_count_jobs + 1;

    -- 4. Process stops
    for v_stop_record in select * from jsonb_array_elements(v_job_record->'stops') loop
      -- Find or create site geofence
      select id into v_site_id
      from public.site
      where tenant_id = p_tenant_id and label = (v_stop_record->>'siteLabel')
      limit 1;

      if v_site_id is null then
        insert into public.site (tenant_id, customer_id, label, latitude, longitude, radius_m)
        values (
          p_tenant_id, 
          v_customer_id, 
          v_stop_record->>'siteLabel', 
          (v_stop_record->>'latitude')::double precision, 
          (v_stop_record->>'longitude')::double precision, 
          coalesce((v_stop_record->>'radiusM')::int, 150)
        )
        returning id into v_site_id;
      end if;

      -- Insert job stop
      insert into public.job_stop (tenant_id, job_id, site_id, sequence, booking_slot_at)
      values (
        p_tenant_id, 
        v_job_id, 
        v_site_id, 
        (v_stop_record->>'sequence')::int, 
        case when v_stop_record->>'bookingSlotAt' = '' or v_stop_record->>'bookingSlotAt' is null then null else (v_stop_record->>'bookingSlotAt')::timestamptz end
      )
      on conflict (job_id, sequence) do update set
        site_id = excluded.site_id,
        booking_slot_at = excluded.booking_slot_at;
    end loop;
  end loop;

  -- Log success in sync log
  insert into public.integration_sync_log (tenant_id, provider_id, status, records_processed)
  values (p_tenant_id, p_provider_id, 'success', v_count_jobs);

  return json_build_object('success', true, 'records_processed', v_count_jobs);
end;
$$;


