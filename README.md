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
4. Apply the database migration: paste `supabase/migrations/*.sql` into the Supabase SQL editor,
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

## Roadmap

1. ~~Scaffold, auth and role-based navigation~~
2. Data model: older adults, caregiver/family links, check-ins, flags
3. Caregiver check-in flow (offline-first)
4. Family dashboard
5. Rule-based deviation detection (edge function, rolling baseline)
6. Internal testing (TestFlight / Play internal track)
7. Store submission

## Before a real pilot

This app handles health-related data about older adults. The consent text in `app/consent.tsx`
is a draft: have it reviewed for GDPR compliance before any real user data is collected.
