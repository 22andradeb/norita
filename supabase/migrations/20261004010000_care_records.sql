-- Care records: the people being cared for, who is on their care team, invite codes,
-- and everything caregivers log (check-ins, vitals, medications, food, other care events).
--
-- Design notes
-- - Log rows are append-only for users: corrections are new entries, which keeps an audit trail.
-- - Log ids are generated on the phone so an entry saved offline can be retried without duplicates.
-- - Free-text fields are length-capped; keep identifying details out of them (data minimisation).

-- ---------------------------------------------------------------------------
-- People and care teams
-- ---------------------------------------------------------------------------

create type public.gender as enum ('female', 'male', 'non_binary', 'prefer_not_to_say');

create table public.older_adults (
  id          uuid primary key default gen_random_uuid(),
  nickname    text not null check (char_length(trim(nickname)) between 1 and 60),
  birth_year  smallint check (birth_year between 1900 and 2100),
  gender      public.gender,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.care_team (
  older_adult_id uuid not null references public.older_adults (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  role           public.user_role not null,
  joined_at      timestamptz not null default now(),
  primary key (older_adult_id, user_id)
);
create index care_team_user_id_idx on public.care_team (user_id);

create table public.invite_codes (
  code           text primary key,
  older_adult_id uuid not null references public.older_adults (id) on delete cascade,
  created_by     uuid references auth.users (id) on delete set null,
  expires_at     timestamptz not null default now() + interval '7 days',
  redeemed_by    uuid references auth.users (id) on delete set null,
  redeemed_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- Membership helpers used by RLS policies. security definer so they can read care_team
-- without recursing through care_team's own policies.
create function public.is_member(p_older_adult_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.care_team
    where older_adult_id = p_older_adult_id and user_id = (select auth.uid())
  );
$$;

create function public.is_caregiver_of(p_older_adult_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.care_team
    where older_adult_id = p_older_adult_id and user_id = (select auth.uid()) and role = 'caregiver'
  );
$$;

create function public.shares_team_with(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.care_team mine
    join public.care_team theirs on theirs.older_adult_id = mine.older_adult_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
  );
$$;

alter table public.older_adults enable row level security;
alter table public.care_team enable row level security;
alter table public.invite_codes enable row level security;

revoke all on public.older_adults, public.care_team, public.invite_codes from anon, authenticated;

-- Rows in these three tables are created only through the RPCs below.
grant select on public.older_adults to authenticated;
grant update (nickname, birth_year, gender) on public.older_adults to authenticated;
create policy "Care team can read" on public.older_adults
  for select to authenticated using (public.is_member(id));
create policy "Caregivers can edit" on public.older_adults
  for update to authenticated
  using (public.is_caregiver_of(id)) with check (public.is_caregiver_of(id));

grant select, delete on public.care_team to authenticated;
create policy "Care team can see each other" on public.care_team
  for select to authenticated using (public.is_member(older_adult_id));
create policy "Users can leave a care team" on public.care_team
  for delete to authenticated using (user_id = (select auth.uid()));

grant select on public.invite_codes to authenticated;
create policy "Caregivers can see invites" on public.invite_codes
  for select to authenticated using (public.is_caregiver_of(older_adult_id));

-- Let team members see each other's names (e.g. who logged an entry).
create policy "Team members can read each other's profile" on public.profiles
  for select to authenticated using (public.shares_team_with(id));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create function public.create_older_adult(
  p_nickname   text,
  p_birth_year integer default null,
  p_gender     public.gender default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'caregiver') then
    raise exception 'Only caregivers can add a person' using errcode = '42501';
  end if;

  insert into public.older_adults (nickname, birth_year, gender, created_by)
  values (trim(p_nickname), p_birth_year, p_gender, (select auth.uid()))
  returning id into v_id;

  insert into public.care_team (older_adult_id, user_id, role)
  values (v_id, (select auth.uid()), 'caregiver');

  return v_id;
end;
$$;

-- 8 characters from a 32-letter alphabet without look-alikes (no 0/O, 1/I): ~40 bits,
-- single-use and valid for 7 days.
create function public.create_invite(p_older_adult_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  if not public.is_caregiver_of(p_older_adult_id) then
    raise exception 'Only this person''s caregivers can create an invite' using errcode = '42501';
  end if;

  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, (get_byte(uuid_send(gen_random_uuid()), 0) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.invite_codes where code = v_code);
  end loop;

  insert into public.invite_codes (code, older_adult_id, created_by)
  values (v_code, p_older_adult_id, (select auth.uid()));

  return v_code;
end;
$$;

-- Joins the caller to the person's care team with the caller's own role
-- (family members get read access; a caregiver can use a code to become a co-caregiver).
create function public.redeem_invite(p_code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_code   text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_role   public.user_role;
  v_invite public.invite_codes;
begin
  select role into v_role from public.profiles where id = (select auth.uid());
  if v_role is null then
    raise exception 'No profile for this user' using errcode = '42501';
  end if;

  select * into v_invite from public.invite_codes where code = v_code for update;
  if not found or v_invite.redeemed_at is not null or v_invite.expires_at < now() then
    raise exception 'This code is not valid or has expired';
  end if;

  insert into public.care_team (older_adult_id, user_id, role)
  values (v_invite.older_adult_id, (select auth.uid()), v_role)
  on conflict do nothing;

  update public.invite_codes
  set redeemed_by = (select auth.uid()), redeemed_at = now()
  where code = v_code;

  return v_invite.older_adult_id;
end;
$$;

revoke execute on function public.create_older_adult(text, integer, public.gender) from public, anon;
revoke execute on function public.create_invite(uuid) from public, anon;
revoke execute on function public.redeem_invite(text) from public, anon;
grant execute on function public.create_older_adult(text, integer, public.gender) to authenticated;
grant execute on function public.create_invite(uuid) to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Logs
-- ---------------------------------------------------------------------------

-- Quick structured check-in per visit. Scales: 1 = very poor … 5 = very good;
-- confusion: 0 = none … 3 = severe.
create table public.check_ins (
  id             uuid primary key,
  older_adult_id uuid not null references public.older_adults (id) on delete cascade,
  recorded_by    uuid default auth.uid() references auth.users (id) on delete set null,
  recorded_at    timestamptz not null,
  created_at     timestamptz not null default now(),
  appetite       smallint check (appetite between 1 and 5),
  mobility       smallint check (mobility between 1 and 5),
  mood           smallint check (mood between 1 and 5),
  confusion      smallint check (confusion between 0 and 3),
  social_contact boolean,
  medications    text check (medications in ('all_taken', 'some_missed', 'none_taken', 'not_applicable')),
  notes          text check (char_length(notes) <= 1000)
);

create table public.vitals (
  id                  uuid primary key,
  older_adult_id      uuid not null references public.older_adults (id) on delete cascade,
  recorded_by         uuid default auth.uid() references auth.users (id) on delete set null,
  recorded_at         timestamptz not null,
  created_at          timestamptz not null default now(),
  systolic            smallint check (systolic between 50 and 260),
  diastolic           smallint check (diastolic between 30 and 160),
  heart_rate          smallint check (heart_rate between 20 and 250),
  temperature_c       numeric(4, 1) check (temperature_c between 30 and 45),
  spo2                smallint check (spo2 between 50 and 100),
  respiratory_rate    smallint check (respiratory_rate between 4 and 60),
  blood_glucose_mg_dl smallint check (blood_glucose_mg_dl between 20 and 800),
  weight_kg           numeric(5, 1) check (weight_kg between 20 and 300),
  pain_score          smallint check (pain_score between 0 and 10),
  notes               text check (char_length(notes) <= 1000),
  check ((systolic is null) = (diastolic is null)),
  check (num_nonnulls(systolic, heart_rate, temperature_c, spo2, respiratory_rate,
                      blood_glucose_mg_dl, weight_kg, pain_score) > 0)
);

create table public.meals (
  id             uuid primary key,
  older_adult_id uuid not null references public.older_adults (id) on delete cascade,
  recorded_by    uuid default auth.uid() references auth.users (id) on delete set null,
  recorded_at    timestamptz not null,
  created_at     timestamptz not null default now(),
  meal_type      text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'drink')),
  amount_eaten   text check (amount_eaten in ('none', 'little', 'half', 'most', 'all')),
  fluids_ml      smallint check (fluids_ml between 0 and 5000),
  description    text check (char_length(description) <= 300),
  notes          text check (char_length(notes) <= 1000)
);

-- Everything else (sleep, toileting, falls, skin, personal care, …). Category-specific
-- answers live in `details`; the app defines the fields for each category.
create table public.care_events (
  id             uuid primary key,
  older_adult_id uuid not null references public.older_adults (id) on delete cascade,
  recorded_by    uuid default auth.uid() references auth.users (id) on delete set null,
  recorded_at    timestamptz not null,
  created_at     timestamptz not null default now(),
  category       text not null check (category in ('sleep', 'toileting', 'fall', 'skin', 'hygiene',
                                                   'activity', 'behaviour', 'appointment', 'other')),
  severity       text not null default 'info' check (severity in ('info', 'concern', 'urgent')),
  details        jsonb not null default '{}'
                 check (jsonb_typeof(details) = 'object' and pg_column_size(details) < 4000),
  notes          text check (char_length(notes) <= 1000)
);

-- ---------------------------------------------------------------------------
-- Medications, doses and stock
-- ---------------------------------------------------------------------------

create table public.medications (
  id                  uuid primary key,
  older_adult_id      uuid not null references public.older_adults (id) on delete cascade,
  name                text not null check (char_length(trim(name)) between 1 and 120),
  dose                text check (char_length(dose) <= 60),
  form                text check (char_length(form) <= 40),
  instructions        text check (char_length(instructions) <= 300),
  times               text[] not null default '{}'
                      check (array_to_string(times, ',') ~ '^(([01][0-9]|2[0-3]):[0-5][0-9](,([01][0-9]|2[0-3]):[0-5][0-9])*)?$'),
  as_needed           boolean not null default false,
  -- Maintained only by the stock-event trigger, never written directly by users.
  stock_quantity      numeric(10, 2) not null default 0,
  stock_unit          text not null default 'units' check (char_length(stock_unit) <= 20),
  low_stock_threshold numeric(10, 2) check (low_stock_threshold >= 0),
  active              boolean not null default true,
  created_by          uuid default auth.uid() references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (id, older_adult_id)
);

create table public.medication_doses (
  id             uuid primary key,
  medication_id  uuid not null,
  older_adult_id uuid not null,
  recorded_by    uuid default auth.uid() references auth.users (id) on delete set null,
  recorded_at    timestamptz not null,
  created_at     timestamptz not null default now(),
  status         text not null check (status in ('given', 'refused', 'missed', 'held')),
  quantity       numeric(10, 2) not null default 1 check (quantity > 0),
  notes          text check (char_length(notes) <= 1000),
  foreign key (medication_id, older_adult_id) references public.medications (id, older_adult_id) on delete cascade
);

-- Every stock change is an event; medications.stock_quantity is their running total.
create table public.medication_stock_events (
  id             uuid primary key default gen_random_uuid(),
  medication_id  uuid not null,
  older_adult_id uuid not null,
  recorded_by    uuid default auth.uid() references auth.users (id) on delete set null,
  recorded_at    timestamptz not null,
  created_at     timestamptz not null default now(),
  delta          numeric(10, 2) not null check (delta <> 0),
  reason         text not null check (reason in ('initial', 'refill', 'dose', 'disposed', 'correction')),
  notes          text check (char_length(notes) <= 1000),
  foreign key (medication_id, older_adult_id) references public.medications (id, older_adult_id) on delete cascade
);

create function public.apply_stock_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.medications
  set stock_quantity = stock_quantity + new.delta
  where id = new.medication_id;
  return new;
end;
$$;

create trigger on_stock_event_inserted
  after insert on public.medication_stock_events
  for each row execute function public.apply_stock_event();

create function public.deduct_dose_from_stock()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.medication_stock_events
    (medication_id, older_adult_id, recorded_by, recorded_at, delta, reason)
  values
    (new.medication_id, new.older_adult_id, new.recorded_by, new.recorded_at, -new.quantity, 'dose');
  return new;
end;
$$;

create trigger on_dose_given
  after insert on public.medication_doses
  for each row when (new.status = 'given')
  execute function public.deduct_dose_from_stock();

alter table public.medications enable row level security;
revoke all on public.medications from anon, authenticated;
grant select on public.medications to authenticated;
grant insert (id, older_adult_id, name, dose, form, instructions, times, as_needed,
              stock_unit, low_stock_threshold, active, created_by) on public.medications to authenticated;
grant update (name, dose, form, instructions, times, as_needed,
              stock_unit, low_stock_threshold, active) on public.medications to authenticated;
create policy "Care team can read" on public.medications
  for select to authenticated using (public.is_member(older_adult_id));
create policy "Caregivers can add" on public.medications
  for insert to authenticated
  with check (public.is_caregiver_of(older_adult_id) and created_by = (select auth.uid()));
create policy "Caregivers can edit" on public.medications
  for update to authenticated
  using (public.is_caregiver_of(older_adult_id)) with check (public.is_caregiver_of(older_adult_id));

-- Same rules for every log table: the whole care team reads, caregivers append as themselves.
do $$
declare
  t text;
begin
  foreach t in array array['check_ins', 'vitals', 'meals', 'care_events',
                           'medication_doses', 'medication_stock_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert on public.%I to authenticated', t);
    execute format($p$create policy "Care team can read" on public.%I
                      for select to authenticated using (public.is_member(older_adult_id))$p$, t);
    execute format($p$create policy "Caregivers can log" on public.%I
                      for insert to authenticated
                      with check (public.is_caregiver_of(older_adult_id) and recorded_by = (select auth.uid()))$p$, t);
    execute format('create index %I on public.%I (older_adult_id, recorded_at desc)', t || '_timeline_idx', t);
  end loop;
end
$$;

-- Dose deductions come only from the trigger.
alter policy "Caregivers can log" on public.medication_stock_events
  with check (public.is_caregiver_of(older_adult_id) and recorded_by = (select auth.uid()) and reason <> 'dose');

-- ---------------------------------------------------------------------------
-- Timeline: one feed of everything logged about a person.
-- security_invoker makes the underlying tables' RLS apply to whoever queries it.
-- ---------------------------------------------------------------------------

create view public.activity with (security_invoker = true) as
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
) a
left join public.profiles p on p.id = a.recorded_by;

revoke all on public.activity from anon, authenticated;
grant select on public.activity to authenticated;
