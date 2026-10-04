-- Appointments (managed by the whole care team, including family) and caregiver visit
-- arrival/departure, which family members see on their Today screen.

-- ---------------------------------------------------------------------------
-- Appointments: planned, editable, cancelled rather than deleted.
-- ---------------------------------------------------------------------------

create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  older_adult_id  uuid not null references public.older_adults (id) on delete cascade,
  title           text not null check (char_length(trim(title)) between 1 and 120),
  starts_at       timestamptz not null,
  kind            text not null default 'consultation'
                  check (kind in ('consultation', 'tests', 'therapy', 'vaccine', 'dentist', 'other')),
  place           text check (char_length(place) <= 200),
  professional    text check (char_length(professional) <= 120),
  needs_companion boolean not null default false,
  notes           text check (char_length(notes) <= 1000),
  status          text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index appointments_timeline_idx on public.appointments (older_adult_id, starts_at);

create function public.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger appointments_touch before update on public.appointments
  for each row execute function public.touch_updated_at();

alter table public.appointments enable row level security;
revoke all on public.appointments from anon, authenticated;
grant select on public.appointments to authenticated;
grant insert (older_adult_id, title, starts_at, kind, place, professional, needs_companion, notes, created_by)
  on public.appointments to authenticated;
grant update (title, starts_at, kind, place, professional, needs_companion, notes, status)
  on public.appointments to authenticated;

create policy "Care team can read" on public.appointments
  for select to authenticated using (public.is_member(older_adult_id));
create policy "Care team can add" on public.appointments
  for insert to authenticated
  with check (public.is_member(older_adult_id) and created_by = (select auth.uid()));
create policy "Care team can edit" on public.appointments
  for update to authenticated
  using (public.is_member(older_adult_id)) with check (public.is_member(older_adult_id));

-- ---------------------------------------------------------------------------
-- Visit events: a caregiver taps "He llegado" / "Me voy". Append-only like other logs,
-- with phone-generated ids so they work offline.
-- ---------------------------------------------------------------------------

create table public.visit_events (
  id             uuid primary key,
  older_adult_id uuid not null references public.older_adults (id) on delete cascade,
  recorded_by    uuid default auth.uid() references auth.users (id) on delete set null,
  recorded_at    timestamptz not null,
  created_at     timestamptz not null default now(),
  kind           text not null check (kind in ('arrival', 'departure'))
);
create index visit_events_timeline_idx on public.visit_events (older_adult_id, recorded_at desc);

alter table public.visit_events enable row level security;
revoke all on public.visit_events from anon, authenticated;
grant select, insert on public.visit_events to authenticated;
create policy "Care team can read" on public.visit_events
  for select to authenticated using (public.is_member(older_adult_id));
create policy "Caregivers can log" on public.visit_events
  for insert to authenticated
  with check (public.is_caregiver_of(older_adult_id) and recorded_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Timeline: same as before plus visits.
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
) a
left join public.profiles p on p.id = a.recorded_by;
