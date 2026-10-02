create or replace function public.get_meter_power_gauge_seed(
  _meter_ids uuid[],
  _fresh_cutoff timestamptz,
  _day_start timestamptz,
  _day_end timestamptz
)
returns table(meter_id uuid, latest_value numeric, latest_at timestamptz, peak_abs numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select m.id,
         l.power_value::numeric,
         l.recorded_at,
         greatest(coalesce(p.peak_raw, 0), coalesce(a.peak_agg, 0))::numeric
  from unnest(_meter_ids) as m(id)
  left join lateral (
    select r.power_value, r.recorded_at
    from public.meter_power_readings r
    where r.meter_id = m.id and r.recorded_at >= _fresh_cutoff
    order by r.recorded_at desc
    limit 1
  ) l on true
  left join lateral (
    select max(abs(r.power_value)) as peak_raw
    from public.meter_power_readings r
    where r.meter_id = m.id and r.recorded_at >= _day_start and r.recorded_at <= _day_end
  ) p on true
  left join lateral (
    select max(abs(coalesce(b.power_max, b.power_avg))) as peak_agg
    from public.meter_power_readings_5min b
    where b.meter_id = m.id and b.bucket >= _day_start and b.bucket <= _day_end
  ) a on true
$$;

grant execute on function public.get_meter_power_gauge_seed(uuid[], timestamptz, timestamptz, timestamptz) to authenticated, anon, service_role;

create or replace function public.get_sensor_readings_5min_multi(
  _meter_ids uuid[],
  _from timestamptz,
  _to timestamptz,
  _limit_per_meter integer default 2000
)
returns table(meter_id uuid, bucket timestamptz, value_avg numeric, value_min numeric, value_max numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select s.meter_id, s.bucket, s.value_avg::numeric, s.value_min::numeric, s.value_max::numeric
  from unnest(_meter_ids) as m(id)
  cross join lateral (
    select r.meter_id, r.bucket, r.value_avg, r.value_min, r.value_max
    from public.sensor_readings_5min r
    where r.meter_id = m.id and r.bucket >= _from and r.bucket <= _to
    order by r.bucket
    limit coalesce(_limit_per_meter, 2000)
  ) s
$$;

grant execute on function public.get_sensor_readings_5min_multi(uuid[], timestamptz, timestamptz, integer) to authenticated, anon, service_role;