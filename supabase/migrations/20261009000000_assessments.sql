-- Validated scales replace the app's own wellbeing number:
--   WHO-5 Well-Being Index (WHO; Spanish version validated in older adults): 5 items about the last
--   two weeks, each 0–5; score = sum × 4 → 0–100. ≤ 50 = low wellbeing, ≤ 28 = very low (screen for
--   depression); a 10-point change is considered meaningful.
--   FRAIL scale (Morley et al., 2012): Fatigue, Resistance, Ambulation, Illnesses, Loss of weight;
--   0 = robust, 1–2 = prefrail, 3–5 = frail. Listed as the self-reported alternative to the SPPB in
--   Spain's 2026 consensus on frailty prevention, which takes >= 1 point as "high probability of
--   frailty" (screen positive) for people aged 70+.
-- Scores are computed here, never trusted from the client.

create table public.assessments (
  id             uuid primary key,
  older_adult_id uuid not null references public.older_adults (id) on delete cascade,
  recorded_by    uuid default auth.uid() references auth.users (id) on delete set null,
  recorded_at    timestamptz not null,
  created_at     timestamptz not null default now(),
  instrument     text not null check (instrument in ('who5', 'frail')),
  answers        jsonb not null,
  score          smallint not null,
  category       text not null,
  notes          text check (char_length(notes) <= 1000)
);
create index assessments_timeline_idx on public.assessments (older_adult_id, instrument, recorded_at desc);

create function public.score_assessment()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  item jsonb;
  total int := 0;
  allowed_illnesses constant text[] := array['hypertension', 'diabetes', 'cancer', 'lung', 'heart_attack',
    'heart_failure', 'angina', 'asthma', 'arthritis', 'stroke', 'kidney'];
begin
  if new.instrument = 'who5' then
    if jsonb_typeof(new.answers) <> 'array' or jsonb_array_length(new.answers) <> 5 then
      raise exception 'WHO-5 needs 5 answers';
    end if;
    for item in select * from jsonb_array_elements(new.answers) loop
      if jsonb_typeof(item) <> 'number' or (item)::int not between 0 and 5 then
        raise exception 'WHO-5 answers must be 0-5';
      end if;
      total := total + (item)::int;
    end loop;
    new.score := total * 4;
    new.category := case when new.score <= 28 then 'very_low' when new.score <= 50 then 'low' else 'good' end;
  else
    if jsonb_typeof(new.answers) <> 'object'
       or not (new.answers ->> 'fatigue') = any (array['all', 'most', 'some', 'little', 'none'])
       or jsonb_typeof(new.answers -> 'resistance') <> 'boolean'
       or jsonb_typeof(new.answers -> 'ambulation') <> 'boolean'
       or jsonb_typeof(new.answers -> 'weight_loss') <> 'boolean'
       or jsonb_typeof(new.answers -> 'illnesses') <> 'array'
       or exists (select 1 from jsonb_array_elements_text(new.answers -> 'illnesses') i where not i = any (allowed_illnesses)) then
      raise exception 'Invalid FRAIL answers';
    end if;
    total := (case when new.answers ->> 'fatigue' in ('all', 'most') then 1 else 0 end)
           + (case when (new.answers ->> 'resistance')::boolean then 1 else 0 end)
           + (case when (new.answers ->> 'ambulation')::boolean then 1 else 0 end)
           + (case when jsonb_array_length(new.answers -> 'illnesses') >= 5 then 1 else 0 end)
           + (case when (new.answers ->> 'weight_loss')::boolean then 1 else 0 end);
    new.score := total;
    new.category := case when total = 0 then 'robust' when total <= 2 then 'prefrail' else 'frail' end;
  end if;
  return new;
end;
$$;

create trigger assessments_score before insert on public.assessments
  for each row execute function public.score_assessment();

-- Anyone on the care team can run an assessment with the person; append-only like other logs.
alter table public.assessments enable row level security;
revoke all on public.assessments from anon, authenticated;
grant select, insert on public.assessments to authenticated;
create policy "Care team can read" on public.assessments
  for select to authenticated using (public.is_member(older_adult_id));
create policy "Care team can record" on public.assessments
  for insert to authenticated
  with check (public.is_member(older_adult_id) and recorded_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Alerts from results
-- ---------------------------------------------------------------------------

create function public.assessment_alerts()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  prev record;
  rank_new int;
  rank_prev int;
  label text;
begin
  select score, category into prev from public.assessments
  where older_adult_id = new.older_adult_id and instrument = new.instrument and id <> new.id and recorded_at < new.recorded_at
  order by recorded_at desc limit 1;

  if new.instrument = 'who5' then
    if new.score <= 28 then
      perform public.raise_alert(new.older_adult_id, 'who5_low', 'alert', 'Bienestar muy bajo (WHO-5: ' || new.score || ')',
        'Conviene comentarlo con su médico', 'who5:' || new.id, new.id, new.recorded_by);
    elsif new.score <= 50 then
      perform public.raise_alert(new.older_adult_id, 'who5_low', 'watch', 'Bienestar bajo (WHO-5: ' || new.score || ')',
        'Por debajo de 50 se recomienda valorarlo con su médico', 'who5:' || new.id, new.id, new.recorded_by);
    end if;
    if prev.score is not null and prev.score - new.score >= 10 then
      perform public.raise_alert(new.older_adult_id, 'who5_drop', 'watch', 'El bienestar ha bajado',
        'WHO-5: ' || new.score || ' (antes ' || prev.score || ')', 'who5drop:' || new.id, new.id, new.recorded_by);
    end if;
  else
    rank_new := case new.category when 'robust' then 0 when 'prefrail' then 1 else 2 end;
    rank_prev := case prev.category when 'robust' then 0 when 'prefrail' then 1 when 'frail' then 2 end;
    label := case new.category when 'robust' then 'robusto/a' when 'prefrail' then 'prefrágil' else 'frágil' end;
    -- Spain's 2026 consensus uses FRAIL >= 1 as the screening cut-off for "high probability of frailty".
    if new.score >= 1 and coalesce(prev.score, 0) = 0 then
      perform public.raise_alert(new.older_adult_id, 'frailty_screen', 'watch',
        'Cribado de fragilidad positivo (FRAIL ' || new.score || '/5)',
        'Alta probabilidad de fragilidad: coméntalo con su médico de atención primaria',
        'frail:' || new.id, new.id, new.recorded_by);
    elsif rank_prev is not null and rank_new > rank_prev then
      perform public.raise_alert(new.older_adult_id, 'frailty_worse', 'watch', 'Fragilidad: ahora ' || label,
        'FRAIL ' || new.score || '/5', 'frail:' || new.id, new.id, new.recorded_by);
    end if;
  end if;
  return new;
end;
$$;

create trigger assessments_raise_alerts after insert on public.assessments
  for each row execute function public.assessment_alerts();

-- ---------------------------------------------------------------------------
-- Periodic checks: drop the old composite "wellbeing dropped" check, remind when scales are due.
-- ---------------------------------------------------------------------------

create or replace function public.check_scheduled_alerts(p_now timestamptz default now())
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

      -- Validated scales due again: WHO-5 every 14 days, FRAIL every 30. One reminder per week / month.
      if not exists (select 1 from public.assessments s where s.older_adult_id = p.id and s.instrument = 'who5'
                     and s.recorded_at >= p_now - interval '14 days') then
        perform public.raise_alert(p.id, 'who5_due', 'info', 'Toca valorar el bienestar (WHO-5)',
          'Se recomienda cada 2 semanas', 'who5due:' || to_char(today, 'IYYY-IW'));
      end if;
      if not exists (select 1 from public.assessments s where s.older_adult_id = p.id and s.instrument = 'frail'
                     and s.recorded_at >= p_now - interval '30 days') then
        perform public.raise_alert(p.id, 'frail_due', 'info', 'Toca valorar la fragilidad (FRAIL)',
          'Se recomienda cada mes', 'fraildue:' || to_char(today, 'YYYY-MM'));
      end if;
    end if;
  end loop;
end;
$$;

drop function if exists public.wellbeing_score(int, int, int, int);

-- ---------------------------------------------------------------------------
-- Timeline: same as before plus assessments.
-- ---------------------------------------------------------------------------

create or replace view public.activity with (security_invoker = true) as
select a.*, p.full_name as recorded_by_name
from (
  select 'check_in'::text as kind, c.id, c.older_adult_id, c.recorded_at, c.recorded_by,
         to_jsonb(c) - array['id', 'older_adult_id', 'recorded_by', 'recorded_at', 'created_at'] as data
  from public.check_ins c
  union all
  select 'vitals', v.id, v.older_adult_id, v.recorded_at, v.recorded_by,
         to_jsonb(v) - array['id', 'older_adult_id', 'recorded_by', 'recorded_at', 'created_at']
  from public.vitals v
  union all
  select 'meal', m.id, m.older_adult_id, m.recorded_at, m.recorded_by,
         to_jsonb(m) - array['id', 'older_adult_id', 'recorded_by', 'recorded_at', 'created_at']
  from public.meals m
  union all
  select 'care_event', e.id, e.older_adult_id, e.recorded_at, e.recorded_by,
         to_jsonb(e) - array['id', 'older_adult_id', 'recorded_by', 'recorded_at', 'created_at']
  from public.care_events e
  union all
  select 'medication_dose', d.id, d.older_adult_id, d.recorded_at, d.recorded_by,
         (to_jsonb(d) - array['id', 'older_adult_id', 'recorded_by', 'recorded_at', 'created_at'])
           || jsonb_build_object('medication_name', med.name, 'medication_dose', med.dose)
  from public.medication_doses d
  join public.medications med on med.id = d.medication_id
  union all
  select 'stock_change', s.id, s.older_adult_id, s.recorded_at, s.recorded_by,
         (to_jsonb(s) - array['id', 'older_adult_id', 'recorded_by', 'recorded_at', 'created_at'])
           || jsonb_build_object('medication_name', med.name, 'stock_unit', med.stock_unit)
  from public.medication_stock_events s
  join public.medications med on med.id = s.medication_id
  where s.reason <> 'dose'
  union all
  select 'visit', ve.id, ve.older_adult_id, ve.recorded_at, ve.recorded_by,
         jsonb_build_object('kind', ve.kind)
  from public.visit_events ve
  union all
  select 'assessment', s.id, s.older_adult_id, s.recorded_at, s.recorded_by,
         jsonb_build_object('instrument', s.instrument, 'score', s.score, 'category', s.category)
  from public.assessments s
) a
left join public.profiles p on p.id = a.recorded_by;
