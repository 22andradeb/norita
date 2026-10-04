-- Profiles: one row per auth user, holding their role and consent state.
-- Kept deliberately small (data minimisation): no phone, address, DOB or ID numbers.

create type public.user_role as enum ('caregiver', 'family');

create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  role            public.user_role not null,
  full_name       text not null check (char_length(full_name) between 1 and 120),
  consented_at    timestamptz,
  consent_version text,
  created_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Column-level grants: users may edit their name and consent, never their role.
-- Rows are only created by the trigger below, so there is no insert grant.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, consented_at, consent_version) on public.profiles to authenticated;

-- Create the profile from the sign-up metadata (role, full_name).
-- Signup fails outright if role is missing or invalid, so no user exists without a role.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    (new.raw_user_meta_data ->> 'role')::public.user_role,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Unnamed')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
