# Norita

Caregiver check-ins for older adults, with a family dashboard that flags changes from a person's usual pattern.
One Expo app with two experiences: **caregiver** and **family**, chosen at sign-up.

## Stack

- Expo (React Native) + TypeScript, Expo Router
- Supabase (Postgres, auth, row-level security; edge functions later)
- EAS Build / Submit for the App Store and Google Play

## First-time setup

1. Install Node.js LTS from https://nodejs.org
2. Install dependencies and align them with the Expo SDK:
   ```bash
   npm install && npx expo install --fix
   ```
3. Create a Supabase project, then copy `.env.example` to `.env` and fill in the URL and anon key.
4. Apply the database migrations in filename order: paste each `supabase/migrations/*.sql` into the Supabase SQL editor,
   or use the Supabase CLI (`npx supabase init`, `npx supabase link`, then `npx supabase db push`).
5. Run the app:
   ```bash
   npx expo start
   ```
   Scan the QR code with Expo Go on your phone.

## How the app is organised

`app/_layout.tsx` gates every area with `Stack.Protected`: signed-out users see `app/(auth)/`,
users who haven't accepted the current consent see `app/consent.tsx`, everyone else gets the tabs.

| Tab | What's on it |
| --- | --- |
| Hoy (`app/home/index.tsx`) | Week strip, wellbeing score ring, medication / fluid / meal rings, next dose, top warnings, vital-sign widgets, streaks, day log |
| Medicación (`app/home/meds.tsx`) | Today's dose checklist (one tap to log), as-needed meds, stock and low-stock warnings |
| Análisis (`app/home/trends.tsx`) | All warnings, period summary, four streaks, logging-coverage calendar, medication adherence, wellbeing, time in range and charts per vital sign, fluids, meals, sleep, what was logged and when |
| Equipo (`app/home/team.tsx`) | Care team, invite codes, fluid goal, account |

Those are the caregiver tabs. Family accounts get a different, analysis-first set (same route files,
switched on the account's role in `app/home/_layout.tsx`; screens in `components/family/`):

| Tab | What's on it |
| --- | --- |
| Hoy | Person card, overall status, next appointment, today's caregiver visit (arrival / departure), today at a glance, warnings, what happened today |
| Salud | Three sections: vital signs (reference bands, average / min / max / % in range, change vs previous period), medication (adherence, punctuality, stock days left), wellbeing (comparison with previous period, mood, confusion, fluids, meals, sleep) |
| Citas | Appointments — the whole care team, family included, can add, edit and cancel |
| Historial | Logging-coverage calendar, streaks, and a collapsible day-by-day history (empty days shown) |
| Equipo | Same as for caregivers |

Caregivers also get the Citas tab, and "He llegado" / "Me voy" buttons on Hoy that family sees as the visit.
Calculations for these live in `lib/family.ts`.

Caregivers get a "+" button that opens the log sheet (`app/log/index.tsx`). The person being viewed is chosen at the top of each tab (`app/people.tsx`)
and remembered per user (`lib/person.tsx`). Tapping a vital widget opens `app/metric/[key].tsx`.

The UI is in Spanish (Spain); dates and numbers are formatted in `lib/format.ts`, which also translates
server error messages. Warnings and streaks are computed in `lib/insights.ts`.

Vital-sign status colours come from general adult reference ranges in `lib/vitals.ts`; they should be
reviewed with a clinician and are not a diagnosis.

## What caregivers can log

Visit check-ins, vital signs (blood pressure, heart rate, temperature, SpO₂, breathing rate, blood
sugar, weight, pain), food and drink, medications (doses given/refused/missed and stock with
low-stock warnings), sleep, toileting, personal care, activity, behaviour, skin, falls,
appointments and free notes.

Each kind is defined once in `lib/logKinds.ts`, which drives both the entry form and the timeline.
Entries are saved on the phone first (`lib/outbox.ts`) and synced when there's a connection.

People are linked with single-use invite codes (8 characters, valid 7 days): a caregiver creates
one on the person's page and shares it; a family member enters it under "Join with a code".

## Medical documents (exams)

Anyone on the care team can upload a photo or PDF of a medical document (Historial → Exámenes,
or "Examen médico" in the caregiver's "+" sheet). Files go to the private `medical-documents`
storage bucket; the `transcribe-document` edge function sends them to Claude (`claude-opus-5-5`,
structured outputs, server-side refusal fallback enabled) and saves the summary, transcript and
each result with its reference range and out-of-range flag. Patient identifiers are replaced by
`[omitido]` in the transcript.

Deploy the function once (Supabase CLI):

```bash
npx supabase init            # only if supabase/config.toml doesn't exist yet
npx supabase link --project-ref <your-project-ref>
npx supabase secrets set ANTHROPIC_API_KEY=<your key>
npx supabase functions deploy transcribe-document
```

This sends health documents to the Anthropic API: put a data processing agreement in place and
get the required authorisation before using real patient documents.

## Validated scales (WHO-5 and FRAIL)

Wellbeing and frailty use validated instruments, not an app-made score (`lib/assessments.ts`,
`supabase/migrations/*_assessments.sql`):

- **WHO-5 Well-Being Index** — official Spanish wording (OMS-5, 1998), free to use; Spanish version
  validated in older adults. 5 items × 0–5, score × 4 → 0–100. ≤ 50 low, ≤ 28 very low; a 10-point
  change is meaningful. Suggested every 2 weeks.
- **FRAIL scale** (Morley 2012), Spanish wording as used in Spanish primary care — have a clinician
  confirm it matches their service's version. 0 robust, 1–2 prefrail, 3–5 frail; Spain's 2026
  consensus on frailty prevention treats ≥ 1 as a positive screen. Suggested monthly.

Anyone on the care team can run them with the person (Hoy, Salud → Bienestar, or "+"). The
database recomputes every score, raises alerts on low/falling WHO-5 and positive/worsening FRAIL,
and reminds the team when a scale is due. Both are screening tools, not a diagnosis.

## Notifications

Alerts are created in the database (`supabase/migrations/*_alerts.sql`): triggers on new entries
(falls, urgent events, missed doses, vitals out of the reference range or unusual for that person
compared with their last 30 days, confusion, little sleep, abnormal exams) and a check every 10
minutes (nothing logged by 12:00/20:00, unlogged doses, low stock, tomorrow's appointments, and a
morning review of yesterday's fluids, meals and check-in, bowel movements and wellbeing trend).
Each alert is unique per situation, shown on Hoy and in Avisos, and can be marked as seen.

The `send-alerts` edge function pushes pending alerts to the care team (except whoever logged the
entry), respecting each user's preference (Equipo → Notificaciones). pg_cron calls it every
minute; the app also calls it right after syncing entries that can raise alerts.

One-time setup:

```bash
npx eas-cli init                                   # links an Expo project (adds extra.eas.projectId)
openssl rand -hex 32                               # make a random secret, use it below twice
npx supabase secrets set CRON_SECRET=<secret>
npx supabase functions deploy send-alerts --no-verify-jwt
```

Then in the Supabase SQL editor:

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'norita_project_url');
select vault.create_secret('<secret>', 'norita_cron_secret');
```

Push works in Expo Go on iPhone; Android needs a development build.

## Database tests

```bash
npm run test:db
```

Applies all migrations to an in-memory Postgres and checks who can read and write what.

## Roadmap

1. ~~Scaffold, auth and role-based navigation~~
2. ~~Data model: older adults, care teams, invite codes, all care logs~~
3. ~~Caregiver logging (offline-first), check-in streak~~
4. ~~Dashboard redesign: tabs, rings, vital widgets, trends~~ — "next step" card for family still to do
5. Rule-based deviation detection (edge function, rolling baseline)
6. Internal testing (TestFlight / Play internal track)
7. Store submission

## Before a real pilot

This app handles health-related data about older adults. The consent text in `app/consent.tsx`
is a draft: have it reviewed for GDPR compliance before any real user data is collected.
