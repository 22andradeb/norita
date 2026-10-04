-- Support for the redesigned dashboard.

-- Which scheduled slot ("08:00") a dose belongs to, so the Meds checklist can tick it off.
-- Null for as-needed (PRN) doses.
alter table public.medication_doses
  add column scheduled_time text check (scheduled_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- Daily fluid target used by the hydration ring.
alter table public.older_adults
  add column fluid_goal_ml smallint not null default 1500 check (fluid_goal_ml between 500 and 4000);
grant update (fluid_goal_ml) on public.older_adults to authenticated;

-- Care team with names, for the Team tab. RLS on care_team and profiles still applies.
create view public.team_members with (security_invoker = true) as
select t.older_adult_id, t.user_id, t.role, t.joined_at, p.full_name
from public.care_team t
join public.profiles p on p.id = t.user_id;

revoke all on public.team_members from anon, authenticated;
grant select on public.team_members to authenticated;
