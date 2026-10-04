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

## How routing works

`app/_layout.tsx` gates every area with `Stack.Protected`:

| State                               | Area                     |
| ----------------------------------- | ------------------------ |
| Signed out                          | `app/(auth)/` sign-in, sign-up |
| Signed in, no current consent       | `app/consent.tsx`        |
| Consented caregiver                 | `app/caregiver/`         |
| Consented family member             | `app/family/`            |

Roles come from sign-up metadata and are written once by the `handle_new_user` trigger;
users cannot change their own role afterwards (column-level grants).

## What caregivers can log

Visit check-ins, vital signs (blood pressure, heart rate, temperature, SpO₂, breathing rate, blood
sugar, weight, pain), food and drink, medications (doses given/refused/missed and stock with
low-stock warnings), sleep, toileting, personal care, activity, behaviour, skin, falls,
appointments and free notes.

Each kind is defined once in `lib/logKinds.ts`, which drives both the entry form and the timeline.
Entries are saved on the phone first (`lib/outbox.ts`) and synced when there's a connection.

People are linked with single-use invite codes (8 characters, valid 7 days): a caregiver creates
one on the person's page and shares it; a family member enters it under "Join with a code".

## Database tests

```bash
npm run test:db
```

Applies all migrations to an in-memory Postgres and checks who can read and write what.

## Roadmap

1. ~~Scaffold, auth and role-based navigation~~
2. ~~Data model: older adults, care teams, invite codes, all care logs~~
3. ~~Caregiver logging (offline-first)~~ — streak counter still to do
4. Family dashboard (currently a read-only timeline)
5. Rule-based deviation detection (edge function, rolling baseline)
6. Internal testing (TestFlight / Play internal track)
7. Store submission

## Before a real pilot

This app handles health-related data about older adults. The consent text in `app/consent.tsx`
is a draft: have it reviewed for GDPR compliance before any real user data is collected.
