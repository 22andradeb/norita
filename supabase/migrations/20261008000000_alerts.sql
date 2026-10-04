-- Alerts: generated on the server (triggers on new entries + periodic checks), delivered as push
-- notifications by the `send-alerts` edge function, and acknowledged ("Lo he visto") by the team.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

-- What each user wants pushed: only 'alert'-level items, everything, or nothing.
alter table public.profiles
  add column notify_level text not null default 'important' check (notify_level in ('important', 'all', 'none'));
grant update (notify_level) on public.profiles to authenticated;

-- Time-based checks ("nothing logged by midday") run in the person's local time.
alter table public.older_adults add column timezone text not null default 'Europe/Madrid';

-- ---------------------------------------------------------------------------
-- Push tokens (Expo). Written only through the RPCs so a device that changes account moves over.
-- ---------------------------------------------------------------------------

create table public.push_tokens (
  token      text primary key check (char_length(token) <= 200),
  user_id    uuid not null references auth.users (id) on delete cascade,
  platform   text check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;
grant select on public.push_tokens to authenticated;
create policy "Users see their own devices" on public.push_tokens
  for select to authenticated using (user_id = (select auth.uid()));

create function public.register_push_token(p_token text, p_platform text)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.push_tokens (token, user_id, platform)
  values (p_token, (select auth.uid()), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
$$;

create function public.unregister_push_token(p_token text)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.push_tokens where token = p_token and user_id = (select auth.uid());
$$;

revoke execute on function public.register_push_token(text, text) from public, anon;
revoke execute on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Alerts
-- ---------------------------------------------------------------------------

create table public.alerts (
  id              uuid primary key default gen_random_uuid(),
  older_adult_id  uuid not null references public.older_adults (id) on delete cascade,
  kind            text not null,
  level           text not null check (level in ('alert', 'watch', 'info')),
  title           text not null,
  detail          text,
  -- One alert per situation: e.g. 'fall:<event id>' or 'noentries:2026-10-08:noon'.
  dedupe_key      text not null,
  source_id       uuid,
  -- Whoever logged the entry that caused it; they are not notified about their own entry.
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  notified_at     timestamptz,
  acknowledged_by uuid references auth.users (id) on delete set null,
  acknowledged_at timestamptz,
  ack_note        text check (char_length(ack_note) <= 300),
  unique (older_adult_id, dedupe_key)
);
create index alerts_feed_idx on public.alerts (older_adult_id, created_at desc);
create index alerts_pending_idx on public.alerts (created_at) where notified_at is null;

alter table public.alerts enable row level security;
revoke all on public.alerts from anon, authenticated;
grant select on public.alerts to authenticated;
grant update (acknowledged_by, acknowledged_at, ack_note) on public.alerts to authenticated;
create policy "Care team can read" on public.alerts
  for select to authenticated using (public.is_member(older_adult_id));
create policy "Care team can acknowledge" on public.alerts
  for update to authenticated
  using (public.is_member(older_adult_id))
  with check (public.is_member(older_adult_id) and acknowledged_by = (select auth.uid()));

create view public.alert_feed with (security_invoker = true) as
select a.*, cb.full_name as created_by_name, ab.full_name as acknowledged_by_name
from public.alerts a
left join public.profiles cb on cb.id = a.created_by
left join public.profiles ab on ab.id = a.acknowledged_by;
revoke all on public.alert_feed from anon, authenticated;
grant select on public.alert_feed to authenticated;

create function public.raise_alert(
  p_older_adult_id uuid, p_kind text, p_level text, p_title text, p_detail text,
  p_dedupe_key text, p_source_id uuid default null, p_created_by uuid default null
)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.alerts (older_adult_id, kind, level, title, detail, dedupe_key, source_id, created_by)
  values (p_older_adult_id, p_kind, p_level, p_title, p_detail, p_dedupe_key, p_source_id, p_created_by)
  on conflict (older_adult_id, dedupe_key) do nothing;
$$;
revoke execute on function public.raise_alert(uuid, text, text, text, text, text, uuid, uuid) from public, anon, authenticated;

-- Spanish number formatting: 36.8 → "36,8", 120.0 → "120".
create function public.es_num(p numeric)
returns text language sql immutable set search_path = ''
as $$ select case when p = trunc(p) then trunc(p)::text else replace(round(p, 1)::text, '.', ',') end $$;

create function public.es_num(p numeric, p_decimals int)
returns text language sql immutable set search_path = ''
as $$ select replace(round(p, p_decimals)::text, '.', ',') $$;

-- ---------------------------------------------------------------------------
-- Vital signs: general reference ranges (same as the app's lib/vitals.ts) and personal baseline
-- ---------------------------------------------------------------------------

create function public.vital_reference(p_metric text, v numeric, v2 numeric default null, out level text, out label text)
language plpgsql immutable set search_path = ''
as $$
begin
  level := 'normal';
  label := null;
  case p_metric
    when 'blood_pressure' then
      if v >= 180 or v2 >= 120 then level := 'alert'; label := 'muy alta';
      elsif v < 90 then level := 'alert'; label := 'baja';
      elsif v >= 140 or v2 >= 90 then level := 'watch'; label := 'alta';
      end if;
    when 'heart_rate' then
      if v < 40 then level := 'alert'; label := 'muy bajo';
      elsif v > 130 then level := 'alert'; label := 'muy alto';
      elsif v < 50 then level := 'watch'; label := 'bajo';
      elsif v > 100 then level := 'watch'; label := 'alto';
      end if;
    when 'spo2' then
      if v < 90 then level := 'alert'; label := 'bajo';
      elsif v < 95 then level := 'watch'; label := 'algo bajo';
      end if;
    when 'blood_glucose' then
      if v < 70 then level := 'alert'; label := 'baja';
      elsif v > 250 then level := 'alert'; label := 'muy alta';
      elsif v > 180 then level := 'watch'; label := 'alta';
      end if;
    when 'temperature' then
      if v >= 39 then level := 'alert'; label := 'fiebre alta';
      elsif v < 35 then level := 'alert'; label := 'muy baja';
      elsif v >= 37.8 then level := 'watch'; label := 'fiebre';
      elsif v < 36 then level := 'watch'; label := 'baja';
      end if;
    when 'respiratory_rate' then
      if v < 8 or v > 25 then level := 'alert'; label := case when v < 8 then 'muy baja' else 'muy alta' end;
      elsif v < 12 or v > 20 then level := 'watch'; label := case when v < 12 then 'baja' else 'alta' end;
      end if;
    when 'pain' then
      if v >= 7 then level := 'alert'; label := 'intenso';
      elsif v >= 4 then level := 'watch'; label := 'moderado';
      end if;
    else
      null;
  end case;
end;
$$;

create function public.vitals_alerts()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  m record;
  ref record;
  base record;
begin
  for m in
    select * from (values
      ('blood_pressure',   'Tensión arterial',  new.systolic::numeric,          new.diastolic::numeric, 'systolic',            15::numeric, 'mmHg'),
      ('heart_rate',       'Pulso',             new.heart_rate::numeric,        null::numeric,          'heart_rate',          15,          'lpm'),
      ('spo2',             'Oxígeno',           new.spo2::numeric,              null,                   'spo2',                3,           '%'),
      ('blood_glucose',    'Glucosa',           new.blood_glucose_mg_dl::numeric, null,                 'blood_glucose_mg_dl', 40,          'mg/dL'),
      ('temperature',      'Temperatura',       new.temperature_c,              null,                   'temperature_c',       0.8,         '°C'),
      ('respiratory_rate', 'Respiración',       new.respiratory_rate::numeric,  null,                   'respiratory_rate',    4,           'rpm'),
      ('weight',           'Peso',              new.weight_kg,                  null,                   'weight_kg',           2,           'kg'),
      ('pain',             'Dolor',             new.pain_score::numeric,        null,                   'pain_score',          3,           '/10')
    ) as t(metric, name, v, v2, col, min_delta, unit)
    where v is not null
  loop
    ref := public.vital_reference(m.metric, m.v, m.v2);
    if ref.level <> 'normal' then
      perform public.raise_alert(
        new.older_adult_id, 'vital_out_of_range', ref.level,
        m.name || ' ' || ref.label,
        case when m.metric = 'blood_pressure' then m.v || '/' || m.v2 else public.es_num(m.v) end || ' ' || m.unit,
        'vital:' || new.id || ':' || m.metric, new.id, new.recorded_by);
    else
      -- Within the general range, but unusual for this person? Compare with the last 30 days.
      execute format(
        'select count(%1$I) n, avg(%1$I) mean, coalesce(stddev_samp(%1$I), 0) sd from public.vitals
          where older_adult_id = $1 and id <> $2 and recorded_at >= $3 - interval ''30 days'' and recorded_at < $3', m.col)
        into base using new.older_adult_id, new.id, new.recorded_at;
      if base.n >= 5 and abs(m.v - base.mean) > greatest(2 * base.sd, m.min_delta) then
        perform public.raise_alert(
          new.older_adult_id, 'vital_unusual', 'watch',
          m.name || case when m.v > base.mean then ' más alto' else ' más bajo' end || ' de lo habitual',
          public.es_num(m.v) || ' ' || m.unit || ' (su media: ' || public.es_num(base.mean, case when m.metric in ('temperature', 'weight') then 1 else 0 end) || ')',
          'vital:' || new.id || ':' || m.metric, new.id, new.recorded_by);
      end if;
    end if;
  end loop;
  return new;
end;
$$;

create trigger vitals_raise_alerts after insert on public.vitals
  for each row execute function public.vitals_alerts();

-- ---------------------------------------------------------------------------
-- Other entries
-- ---------------------------------------------------------------------------

create function public.care_event_alerts()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  label text := case new.category
    when 'sleep' then 'sueño' when 'toileting' then 'baño' when 'skin' then 'piel'
    when 'hygiene' then 'higiene' when 'activity' then 'actividad' when 'behaviour' then 'conducta'
    when 'appointment' then 'cita médica' else 'nota' end;
begin
  if new.category = 'fall' then
    perform public.raise_alert(new.older_adult_id, 'fall', 'alert',
      case when (new.details ->> 'near_miss')::boolean then 'Casi caída registrada' else 'Caída registrada' end,
      nullif(concat_ws(' · ',
        case when (new.details ->> 'injured')::boolean then 'se hizo daño' end,
        case when (new.details ->> 'hit_head')::boolean then 'se golpeó la cabeza' end,
        case when (new.details ->> 'needed_help_up')::boolean then 'necesitó ayuda para levantarse' end), ''),
      'event:' || new.id, new.id, new.recorded_by);
  elsif new.severity = 'urgent' then
    perform public.raise_alert(new.older_adult_id, 'urgent_event', 'alert', 'Aviso urgente: ' || label, null,
      'event:' || new.id, new.id, new.recorded_by);
  elsif new.severity = 'concern' then
    perform public.raise_alert(new.older_adult_id, 'concern_event', 'watch', 'A vigilar: ' || label, null,
      'event:' || new.id, new.id, new.recorded_by);
  end if;

  if new.category = 'sleep' and (new.details ->> 'hours') is not null and (new.details ->> 'hours')::numeric < 5 then
    perform public.raise_alert(new.older_adult_id, 'little_sleep', 'watch',
      'Durmió poco: ' || public.es_num((new.details ->> 'hours')::numeric) || ' h', null,
      'sleep:' || new.id, new.id, new.recorded_by);
  end if;
  return new;
end;
$$;

create trigger care_events_raise_alerts after insert on public.care_events
  for each row execute function public.care_event_alerts();

create function public.dose_alerts()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  med_name text;
begin
  if new.status in ('missed', 'refused') then
    select name into med_name from public.medications where id = new.medication_id;
    perform public.raise_alert(new.older_adult_id, 'missed_dose', 'watch',
      case new.status when 'missed' then 'Toma olvidada: ' else 'Toma rechazada: ' end || med_name,
      case when new.scheduled_time is not null then 'Toma de las ' || new.scheduled_time end,
      'dose:' || new.id, new.id, new.recorded_by);
  end if;
  return new;
end;
$$;

create trigger doses_raise_alerts after insert on public.medication_doses
  for each row execute function public.dose_alerts();

create function public.check_in_alerts()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(new.confusion, 0) >= 2 then
    perform public.raise_alert(new.older_adult_id, 'confusion', 'watch', 'Más confusión de lo habitual',
      case new.confusion when 2 then 'Confusión moderada' else 'Confusión grave' end,
      'checkin:' || new.id, new.id, new.recorded_by);
  end if;
  return new;
end;
$$;

create trigger check_ins_raise_alerts after insert on public.check_ins
  for each row execute function public.check_in_alerts();

create function public.document_alerts()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  flagged int;
begin
  if new.status = 'ready' and old.status is distinct from 'ready' then
    select count(*) into flagged from jsonb_array_elements(new.results) r where r ->> 'flag' in ('high', 'low', 'abnormal');
    if flagged > 0 then
      perform public.raise_alert(new.older_adult_id, 'exam_abnormal', 'watch',
        'Examen con ' || flagged || case when flagged = 1 then ' valor fuera de rango' else ' valores fuera de rango' end,
        new.title, 'exam:' || new.id, new.id, new.uploaded_by);
    end if;
  end if;
  return new;
end;
$$;

create trigger medical_documents_raise_alerts after update on public.medical_documents
  for each row execute function public.document_alerts();

-- ---------------------------------------------------------------------------
-- Periodic checks (scheduled every 10 minutes; idempotent thanks to dedupe keys)
-- ---------------------------------------------------------------------------

create function public.wellbeing_score(p_appetite int, p_mobility int, p_mood int, p_confusion int)
returns numeric language sql immutable set search_path = ''
as $$
  select case when num_nonnulls(p_appetite, p_mobility, p_mood) = 0 then null else
    greatest(0, least(100,
      ((coalesce(p_appetite, 0) + coalesce(p_mobility, 0) + coalesce(p_mood, 0))::numeric
        / num_nonnulls(p_appetite, p_mobility, p_mood) - 1) / 4 * 100 - coalesce(p_confusion, 0) * 10)) end
$$;

create function public.check_scheduled_alerts(p_now timestamptz default now())
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  p record;
  med record;
  appt record;
  slot text;
  local_ts timestamp;
  today date;
  day_start timestamptz;
  yesterday_start timestamptz;
  fluids int;
  meals int;
  had_entries boolean;
  recent numeric;
  before numeric;
begin
  -- Only people with care logged in the last week: no nagging about unused profiles.
  for p in
    select oa.* from public.older_adults oa
    where exists (select 1 from public.activity a where a.older_adult_id = oa.id and a.recorded_at >= p_now - interval '7 days')
  loop
    local_ts := p_now at time zone p.timezone;
    today := local_ts::date;
    day_start := today::timestamp at time zone p.timezone;
    yesterday_start := (today - 1)::timestamp at time zone p.timezone;

    -- Nothing logged today.
    if not exists (select 1 from public.activity a where a.older_adult_id = p.id and a.recorded_at >= day_start) then
      if extract(hour from local_ts) >= 20 then
        perform public.raise_alert(p.id, 'no_entries', 'alert', 'Hoy no se ha registrado ninguna visita', null,
          'noentries:' || today || ':evening');
      elsif extract(hour from local_ts) >= 12 then
        perform public.raise_alert(p.id, 'no_entries', 'watch', 'Hoy aún no hay registros', null,
          'noentries:' || today || ':noon');
      end if;
    end if;

    -- Scheduled doses not logged 90 minutes after their time; low stock.
    for med in select * from public.medications where older_adult_id = p.id and active loop
      if not med.as_needed then
        foreach slot in array med.times loop
          if slot::time + interval '90 minutes' > slot::time  -- no wrap past midnight
             and local_ts::time > slot::time + interval '90 minutes'
             and not exists (select 1 from public.medication_doses d
                             where d.medication_id = med.id and d.scheduled_time = slot and d.recorded_at >= day_start) then
            perform public.raise_alert(p.id, 'dose_not_logged', 'watch', 'Toma sin registrar: ' || med.name,
              'Toma de las ' || slot, 'slot:' || med.id || ':' || today || ':' || slot);
          end if;
        end loop;
      end if;
      if med.low_stock_threshold is not null and med.stock_quantity <= med.low_stock_threshold then
        perform public.raise_alert(p.id, 'low_stock', 'watch', 'Quedan pocas existencias de ' || med.name,
          'Quedan ' || public.es_num(med.stock_quantity) || ' ' || med.stock_unit,
          'stock:' || med.id || ':' || date_trunc('week', today::timestamp)::date);
      end if;
    end loop;

    -- Evening reminder of tomorrow's appointments.
    if extract(hour from local_ts) >= 18 then
      for appt in
        select * from public.appointments
        where older_adult_id = p.id and status = 'scheduled'
          and (starts_at at time zone p.timezone)::date = today + 1
      loop
        perform public.raise_alert(p.id, 'appointment_tomorrow', 'info',
          'Mañana: ' || appt.title || ' a las ' || to_char(appt.starts_at at time zone p.timezone, 'HH24:MI'),
          case when appt.needs_companion then 'Requiere acompañamiento' end,
          'appt:' || appt.id, appt.id, appt.created_by);
      end loop;
    end if;

    -- Morning review of yesterday.
    if extract(hour from local_ts) >= 9 then
      select exists (select 1 from public.activity a where a.older_adult_id = p.id
                     and a.recorded_at >= yesterday_start and a.recorded_at < day_start)
        into had_entries;
      if had_entries then
        select coalesce(sum(fluids_ml), 0),
               count(distinct meal_type) filter (where meal_type in ('breakfast', 'lunch', 'dinner') and amount_eaten is distinct from 'none')
          into fluids, meals
          from public.meals where older_adult_id = p.id and recorded_at >= yesterday_start and recorded_at < day_start;
        if fluids < p.fluid_goal_ml * 0.6 then
          perform public.raise_alert(p.id, 'low_fluids', 'watch', 'Ayer bebió poco: ' || public.es_num(fluids / 1000.0, 1) || ' L',
            'Objetivo: ' || public.es_num(p.fluid_goal_ml / 1000.0, 1) || ' L', 'fluids:' || (today - 1));
        end if;
        if meals <= 1 then
          perform public.raise_alert(p.id, 'few_meals', 'watch',
            'Ayer solo se registró ' || meals || case when meals = 1 then ' comida principal' else ' comidas principales' end,
            null, 'meals:' || (today - 1));
        end if;
        if not exists (select 1 from public.check_ins c where c.older_adult_id = p.id
                       and c.recorded_at >= yesterday_start and c.recorded_at < day_start) then
          perform public.raise_alert(p.id, 'no_check_in', 'watch', 'Ayer no hubo revisión de la visita', null,
            'nocheckin:' || (today - 1));
        end if;
      end if;

      -- No bowel movement logged for 3 days, when toileting is being tracked.
      if exists (select 1 from public.care_events e where e.older_adult_id = p.id and e.category = 'toileting'
                 and e.recorded_at >= p_now - interval '14 days')
         and not exists (select 1 from public.care_events e where e.older_adult_id = p.id and e.category = 'toileting'
                         and e.details ->> 'type' in ('bowel', 'both') and e.recorded_at >= p_now - interval '3 days') then
        perform public.raise_alert(p.id, 'no_bowel', 'watch', 'Sin deposiciones registradas en 3 días', null,
          'bowel:' || today);
      end if;

      -- Wellbeing: last 3 days vs the 14 before.
      select avg(public.wellbeing_score(appetite, mobility, mood, confusion)) into recent
        from public.check_ins where older_adult_id = p.id and recorded_at >= p_now - interval '3 days';
      select avg(public.wellbeing_score(appetite, mobility, mood, confusion)) into before
        from public.check_ins where older_adult_id = p.id
          and recorded_at >= p_now - interval '17 days' and recorded_at < p_now - interval '3 days';
      if recent is not null and before is not null and before - recent >= 15 then
        perform public.raise_alert(p.id, 'wellbeing_drop', 'watch', 'El bienestar ha bajado',
          'Últimos 3 días: ' || round(recent) || ' (antes ' || round(before) || ')', 'wellbeing:' || today);
      end if;
    end if;
  end loop;
end;
$$;
revoke execute on function public.check_scheduled_alerts(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Delivery helpers for the send-alerts edge function (service role only)
-- ---------------------------------------------------------------------------

-- Atomically takes pending alerts so two runs never send the same one twice.
create function public.claim_pending_alerts(p_limit int default 100)
returns setof public.alerts
language sql security definer set search_path = ''
as $$
  update public.alerts set notified_at = now()
  where id in (
    select id from public.alerts
    where notified_at is null and created_at > now() - interval '1 day'
    order by created_at
    limit p_limit
    for update skip locked)
  returning *;
$$;

-- Devices to notify for an alert: the person's care team, except whoever logged it,
-- filtered by each member's notification preference.
create function public.alert_recipients(p_alert_id uuid)
returns table (token text, user_id uuid)
language sql stable security definer set search_path = ''
as $$
  select pt.token, pt.user_id
  from public.alerts a
  join public.care_team ct on ct.older_adult_id = a.older_adult_id
  join public.profiles pr on pr.id = ct.user_id
  join public.push_tokens pt on pt.user_id = ct.user_id
  where a.id = p_alert_id
    and ct.user_id is distinct from a.created_by
    and (pr.notify_level = 'all' or (pr.notify_level = 'important' and a.level = 'alert'));
$$;

revoke execute on function public.claim_pending_alerts(int) from public, anon, authenticated;
revoke execute on function public.alert_recipients(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Scheduling (Supabase: pg_cron + pg_net). The push job needs two Vault secrets, created once
-- in the SQL editor — see README "Notifications". Skipped where the extensions don't exist.
-- ---------------------------------------------------------------------------

create function public.push_pending_alerts()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  base_url text;
  cron_secret text;
begin
  if not exists (select 1 from public.alerts where notified_at is null and created_at > now() - interval '1 day') then
    return;
  end if;
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'norita_project_url';
  select decrypted_secret into cron_secret from vault.decrypted_secrets where name = 'norita_cron_secret';
  if base_url is null or cron_secret is null then
    return;
  end if;
  perform net.http_post(
    url := base_url || '/functions/v1/send-alerts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', cron_secret),
    body := '{}'::jsonb);
end;
$$;
revoke execute on function public.push_pending_alerts() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    perform cron.schedule('norita-alert-checks', '*/10 * * * *', 'select public.check_scheduled_alerts()');
    perform cron.schedule('norita-push-alerts', '* * * * *', 'select public.push_pending_alerts()');
  end if;
end
$$;
