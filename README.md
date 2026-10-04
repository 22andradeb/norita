# Norita

Caregiver check-ins for older adults, with a family dashboard that flags changes from a person's usual pattern.
One Expo app with two experiences: **caregiver** and **family**, chosen at sign-up.

## Stack

- Expo (React Native) + TypeScript, Expo Router
- Supabase (Postgres, auth, row-level security; edge functions later)
- EAS Build / Submit for the App Store and Google Play

## Accounts and services

Everything the app needs lives in these accounts. Keep their logins in a password manager.

| Service | What it's for | Notes |
| --- | --- | --- |
| [GitHub](https://github.com) | Source code (this private repository) | Invite collaborators in Settings → Collaborators |
| [Supabase](https://supabase.com) | Database, logins, file storage, edge functions, scheduled jobs | Hosted in the cloud; works from any computer |
| [Expo](https://expo.dev) | Running the app in Expo Go, push notifications, building with EAS | The project is linked in `app.json` (`extra.eas.projectId`) |
| [Anthropic Console](https://console.anthropic.com) | Claude API, used to transcribe medical documents | Needs billing / credit to work |
| Apple Developer / Google Play Console | Publishing to the stores (not set up yet) | See "Before a real pilot" |

## Keys and secrets

**Never commit real values.** `.env` is git-ignored; server secrets live in Supabase. If a key leaks,
rotate it in the service where it was created.

| Name | What it is | Where it lives | Where to get it | Secret? |
| --- | --- | --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Address of the Supabase project | `.env` on each computer | Supabase → Project Settings → API (or Data API) | No |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Public key the app uses; row-level security protects the data | `.env` on each computer | Supabase → Project Settings → API Keys → `anon` / publishable | No (ships inside the app) |
| Database password | Postgres password, only needed by `npx supabase link` | Your password manager | Set when the Supabase project was created; reset in Project Settings → Database | **Yes** |
| `service_role` / secret key | Full-access Supabase key | Supabase only (functions get it automatically) | Supabase → API Keys | **Yes — never in the app or `.env`** |
| `ANTHROPIC_API_KEY` | Claude API key for `transcribe-document` | Supabase Edge Function secrets | Anthropic Console → Settings → API Keys | **Yes** |
| `CRON_SECRET` | Shared secret so the scheduled job can call `send-alerts` | Supabase Edge Function secrets **and** Vault (`norita_cron_secret`) — same value in both | Generate: `openssl rand -hex 32` | **Yes** |
| `norita_project_url` | Project URL the scheduled job calls | Supabase Vault | `https://<project-ref>.supabase.co` | No |
| EAS project ID | Links the app to the Expo project for push and builds | `app.json` (committed) | Created by `npx eas-cli init` | No |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected into edge functions by
Supabase automatically; don't set them yourself.

To check what's configured on the server: Supabase → Edge Functions → Secrets (should list
`ANTHROPIC_API_KEY` and `CRON_SECRET`), and in the SQL editor
`select name from vault.decrypted_secrets;` (should list `norita_project_url` and `norita_cron_secret`).

## Run the app on a new computer

The Supabase project already holds the database, users and secrets, so a new computer only needs the
code and the `.env` file.

1. Install [Node.js](https://nodejs.org) (LTS) and [Git](https://git-scm.com).
2. Get the code and install dependencies:
   ```bash
   git clone https://github.com/22andradeb/norita.git
   cd norita
   npm install
   ```
3. Create `.env` from the template and fill in the two values from the table above:
   ```bash
   cp .env.example .env
   ```
4. Sign in to Expo (the same account must be signed in to Expo Go on the phone):
   ```bash
   npx expo login
   ```
5. Start the app and scan the QR code with Expo Go:
   ```bash
   npx expo start
   ```
   Keep this Terminal window open while using the app; run other commands in a second window. If the
   phone can't connect (different Wi-Fi, university network), use `npx expo start --tunnel`.

To deploy edge functions or change secrets from that computer, also sign in to Supabase once:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
```

## Set up everything from scratch (new Supabase project)

Only needed for a brand-new environment (e.g. a separate test or production project).

1. **Supabase project**: create it in an EU region (health data). Note the project ref and database
   password.
2. **Auth**: Authentication → Sign In / Providers → Email. For testing you can turn off *Confirm email*
   (the built-in mailer allows only a few emails per hour). Before real users, turn it back on and
   configure your own SMTP (e.g. Resend, Brevo) and a confirmation page.
3. **Database**: in the SQL editor, run each migration **in this order** (or `npx supabase db push`):
   1. `20261004000000_profiles.sql`
   2. `20261004010000_care_records.sql`
   3. `20261005000000_dashboard_support.sql`
   4. `20261006000000_appointments_visits.sql`
   5. `20261007000000_medical_documents.sql`
   6. `20261008000000_alerts.sql` — enable the **pg_cron** and **pg_net** extensions first (Database →
      Extensions) if it complains
   7. `20261009000000_assessments.sql`
4. **App config**: create `.env` (see above).
5. **Transcription of exams**: create an Anthropic API key with billing, then:
   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase secrets set ANTHROPIC_API_KEY=<key>
   npx supabase functions deploy transcribe-document
   ```
6. **Alerts and push notifications**:
   ```bash
   openssl rand -hex 32
   npx supabase secrets set CRON_SECRET=<that value>
   npx supabase functions deploy send-alerts --no-verify-jwt
   npx eas-cli init
   ```
   Then in the SQL editor:
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'norita_project_url');
   select vault.create_secret('<same CRON_SECRET value>', 'norita_cron_secret');
   ```
7. **Check**: run `npm run test:db` locally, start the app, sign up one caregiver and one family account
   (different emails), add a person, create an invite code and join with it.

## Troubleshooting

| What you see | Cause | Fix |
| --- | --- | --- |
| Expo Go: "You need to be signed in…" | Expo Go and Expo CLI use different accounts | `npx expo login` on the computer and sign in to Expo Go with the same account |
| Expo Go: "Could not connect to the server" | The `npx expo start` window was closed, or phone and computer are on different networks | Start it again; or `npx expo start --tunnel` |
| "Port 8081 is running this app in another window" | An old Expo server is still running | Answer **Y** to use another port, or close the old window |
| "Demasiados intentos" at sign-up | Supabase's built-in mailer limit | Turn off *Confirm email* for testing, or set up SMTP |
| "Correo o contraseña incorrectos" right after sign-up | The account was never created (often because of the mail limit) | Check Authentication → Users; sign up again |
| Red banner "La base de datos no está actualizada…" / "Could not find the table" | A migration hasn't been run | Run the missing migration, then tap **Reintentar** |
| Exams: "Falta configurar la clave de la API de Anthropic" | `ANTHROPIC_API_KEY` secret missing | Add it (Edge Functions → Secrets) and tap **Reintentar** |
| Exams: "La clave … no es válida" / service errors | Wrong key or no credit | Check the key and billing in the Anthropic Console |
| Equipo → Notificaciones: "Falta configurar el proyecto" | No EAS project ID | `npx eas-cli init`, then reload the app |
| No push notifications arrive | Notifications go to everyone **except** whoever logged the entry; or preference is "Solo lo importante" | Test with a second phone; check Vault secrets and `CRON_SECRET`; see Edge Functions → send-alerts → Logs |

## How the app is organised

`app/_layout.tsx` gates every area with `Stack.Protected`: signed-out users see `app/(auth)/`,
users who haven't accepted the current consent see `app/consent.tsx`, everyone else gets the tabs.

| Tab | What's on it |
| --- | --- |
| Hoy (`app/home/index.tsx`) | Week strip, visit ("He llegado" / "Me voy"), next appointment, WHO-5 and FRAIL, medication / fluid / meal rings, next dose, alerts, vital-sign widgets, streaks, day log |
| Medicación (`app/home/meds.tsx`) | Today's dose checklist (one tap to log), as-needed meds, stock and low-stock warnings |
| Citas (`app/home/citas.tsx`) | Appointments: add, edit, cancel |
| Historial (`app/home/historial.tsx`) | Day-by-day history and medical documents (exams) |
| Equipo (`app/home/team.tsx`) | Care team, invite codes, fluid goal, notifications, account |

The full analysis screen (`app/home/trends.tsx`) opens from links on Hoy and Historial.

Those are the caregiver tabs. Family accounts get a different, analysis-first set (same route files,
switched on the account's role in `app/home/_layout.tsx`; screens in `components/family/`):

| Tab | What's on it |
| --- | --- |
| Hoy | Person card, overall status, next appointment, today's caregiver visit (arrival / departure), WHO-5 and FRAIL, today at a glance, alerts, what happened today |
| Salud | Three sections: vital signs (reference bands, average / min / max / % in range, change vs previous period), medication (adherence, punctuality, stock days left), wellbeing (comparison with previous period, mood, confusion, fluids, meals, sleep) |
| Citas | Appointments — the whole care team, family included, can add, edit and cancel |
| Historial | Logging-coverage calendar, streaks, collapsible day-by-day history (empty days shown) and exams |
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
morning review of yesterday's fluids, meals and check-in, bowel movements, and WHO-5 / FRAIL reminders).
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
4. ~~Dashboard redesign: tabs, rings, vital widgets, trends, family experience~~
5. ~~Alerts and push notifications (reference ranges and each person's own baseline)~~
6. Internal testing (TestFlight / Play internal track): account deletion, privacy policy, icon, EAS config
7. Store submission

## Before a real pilot

This app handles health-related data about older adults. The consent text in `app/consent.tsx`
is a draft: have it reviewed for GDPR compliance before any real user data is collected.
