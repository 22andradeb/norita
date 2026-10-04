// Applies every migration to an in-memory Postgres (PGlite) with stand-ins for Supabase auth,
// then checks permissions and behaviour as caregiver, family member and outsider. Run: npm run test:db

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MIG = fileURLToPath(new URL('../migrations', import.meta.url));
const db = new PGlite();

// Minimal stand-in for Supabase's auth schema, roles and default grants.
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant select, insert on storage.objects to authenticated;
  create function storage.foldername(name text) returns text[] language sql immutable
    as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`);

for (const f of readdirSync(MIG).sort()) {
  await db.exec(readFileSync(`${MIG}/${f}`, 'utf8'));
  console.log('applied', f);
}

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, extra); }
};

async function as(uid, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated`);
    await tx.query(`select set_config('test.uid', $1, true)`, [uid]);
    return tx.query(sql, params);
  });
}
async function fails(uid, sql, params = []) {
  try { await as(uid, sql, params); return null; } catch (e) { return e.message; }
}

const C = randomUUID(), C2 = randomUUID(), F = randomUUID(), O = randomUUID();
for (const [id, role, name] of [[C, 'caregiver', 'Carla'], [C2, 'caregiver', 'Other carer'], [F, 'family', 'Fam'], [O, 'family', 'Outsider']]) {
  await db.query(`insert into auth.users values ($1, $2)`, [id, { role, full_name: name }]);
}
ok('signup trigger creates profiles', (await db.query(`select count(*)::int n from profiles`)).rows[0].n === 4);
ok('signup without role fails', !!(await db.query(`insert into auth.users values ($1, '{}')`, [randomUUID()]).then(() => null, (e) => e.message)));

console.log('people & invites');
const oa = (await as(C, `select create_older_adult('Abuela', 1940, 'female') id`)).rows[0].id;
ok('caregiver creates person', !!oa);
ok('family cannot create person', !!(await fails(F, `select create_older_adult('X')`)));
ok('creator sees person', (await as(C, `select * from older_adults`)).rows.length === 1);
ok('outsider sees nothing', (await as(O, `select * from older_adults`)).rows.length === 0);

const code = (await as(C, `select create_invite($1) code`, [oa])).rows[0].code;
ok('invite code is 8 chars', /^[A-HJ-NP-Z2-9]{8}$/.test(code), code);
ok('outsider cannot create invite', !!(await fails(O, `select create_invite($1)`, [oa])));
const pretty = `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`;
ok('family redeems formatted code', (await as(F, `select redeem_invite($1) id`, [pretty])).rows[0].id === oa);
ok('code is single-use', !!(await fails(O, `select redeem_invite($1)`, [code])));
ok('bad code rejected', !!(await fails(O, `select redeem_invite('ZZZZZZZZ')`)));
ok('family sees invites? no', (await as(F, `select * from invite_codes`)).rows.length === 0);
ok('caregiver sees invites', (await as(C, `select * from invite_codes`)).rows.length === 1);

console.log('logging');
const now = new Date().toISOString();
const ins = (uid, table, row) => {
  const cols = Object.keys(row);
  return as(uid, `insert into ${table} (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')}) on conflict (id) do nothing`, Object.values(row));
};
const base = () => ({ id: randomUUID(), older_adult_id: oa, recorded_by: C, recorded_at: now });

const ci = { ...base(), appetite: 4, mobility: 3, mood: 5, confusion: 0, social_contact: true, medications: 'all_taken', notes: 'Good day' };
await ins(C, 'check_ins', ci);
await ins(C, 'check_ins', ci); // retry from outbox
ok('duplicate retry is ignored', (await as(C, `select count(*)::int n from check_ins`)).rows[0].n === 1);
await ins(C, 'vitals', { ...base(), systolic: 130, diastolic: 80, heart_rate: 72, temperature_c: 36.8, spo2: 97, weight_kg: 64.5, pain_score: 2 });
ok('empty vitals rejected', !!(await ins(C, 'vitals', { ...base() }).then(() => null, (e) => e.message)));
ok('half blood pressure rejected', !!(await ins(C, 'vitals', { ...base(), systolic: 120 }).then(() => null, (e) => e.message)));
ok('out-of-range vitals rejected', !!(await ins(C, 'vitals', { ...base(), spo2: 120 }).then(() => null, (e) => e.message)));
await ins(C, 'meals', { ...base(), meal_type: 'lunch', amount_eaten: 'half', fluids_ml: 250, description: 'Soup' });
await ins(C, 'care_events', { ...base(), category: 'fall', severity: 'concern', details: { injured: false, hit_head: false } });
ok('recorded_by must be self', !!(await ins(C, 'meals', { ...base(), recorded_by: F, meal_type: 'snack' }).then(() => null, (e) => e.message)));
ok('family cannot log', !!(await ins(F, 'meals', { ...base(), recorded_by: F, meal_type: 'snack' }).then(() => null, (e) => e.message)));
ok('non-member caregiver cannot log', !!(await ins(C2, 'meals', { ...base(), recorded_by: C2, meal_type: 'snack' }).then(() => null, (e) => e.message)));

console.log('medications & stock');
const med = randomUUID();
await ins(C, 'medications', { id: med, older_adult_id: oa, created_by: C, name: 'Paracetamol', dose: '500 mg', times: ['08:00', '20:00'], stock_unit: 'tablets', low_stock_threshold: 5 });
ok('bad time format rejected', !!(await ins(C, 'medications', { id: randomUUID(), older_adult_id: oa, created_by: C, name: 'X', times: ['8:00'] }).then(() => null, (e) => e.message)));
ok('cannot set stock directly on insert', !!(await ins(C, 'medications', { id: randomUUID(), older_adult_id: oa, created_by: C, name: 'Y', stock_quantity: 99 }).then(() => null, (e) => e.message)));
await ins(C, 'medication_stock_events', { ...base(), medication_id: med, delta: 20, reason: 'initial' });
const dose = { ...base(), medication_id: med, status: 'given', quantity: 2 };
await ins(C, 'medication_doses', dose);
await ins(C, 'medication_doses', dose); // retry
await ins(C, 'medication_doses', { ...base(), medication_id: med, status: 'refused', quantity: 1 });
await ins(C, 'medication_stock_events', { ...base(), medication_id: med, delta: 10, reason: 'refill' });
const stock = Number((await as(C, `select stock_quantity from medications where id = $1`, [med])).rows[0].stock_quantity);
ok('stock = 20 - 2 (given, retry ignored, refused ignored) + 10', stock === 28, stock);
ok('client cannot fake dose stock event', !!(await ins(C, 'medication_stock_events', { ...base(), medication_id: med, delta: -1, reason: 'dose' }).then(() => null, (e) => e.message)));
ok('cannot update stock directly', !!(await fails(C, `update medications set stock_quantity = 1000 where id = $1`, [med])));
ok('dose with mismatched person rejected', !!(await ins(C, 'medication_doses', { ...base(), older_adult_id: randomUUID(), medication_id: med, status: 'given' }).then(() => null, (e) => e.message)));

console.log('reading');
const feed = (await as(F, `select kind, recorded_by_name, data from activity where older_adult_id = $1 order by recorded_at desc`, [oa])).rows;
const kinds = feed.map((r) => r.kind).sort();
ok('family sees full timeline', JSON.stringify(kinds) === JSON.stringify(['care_event', 'check_in', 'meal', 'medication_dose', 'medication_dose', 'stock_change', 'stock_change', 'vitals']), kinds);
ok('timeline shows caregiver name', feed.every((r) => r.recorded_by_name === 'Carla'), feed.map((r) => r.recorded_by_name));
ok('dose rows include medication name', feed.find((r) => r.kind === 'medication_dose').data.medication_name === 'Paracetamol');
ok('outsider timeline empty', (await as(O, `select * from activity`)).rows.length === 0);
ok('family reads medications', (await as(F, `select * from medications`)).rows.length === 1);
ok('outsider reads no medications', (await as(O, `select * from medications`)).rows.length === 0);
ok('family sees caregiver profile', (await as(F, `select * from profiles where id = $1`, [C])).rows.length === 1);
ok('outsider cannot see caregiver profile', (await as(O, `select * from profiles where id = $1`, [C])).rows.length === 0);

console.log('dashboard support');
await ins(C, 'medication_doses', { ...base(), medication_id: med, status: 'given', scheduled_time: '08:00' });
ok('dose stores its scheduled slot', (await as(F, `select data->>'scheduled_time' t from activity where kind = 'medication_dose' and data ? 'scheduled_time' and data->>'scheduled_time' is not null`)).rows[0]?.t === '08:00');
ok('bad slot rejected', !!(await ins(C, 'medication_doses', { ...base(), medication_id: med, status: 'given', scheduled_time: '8am' }).then(() => null, (e) => e.message)));
ok('fluid goal defaults to 1500', (await as(F, `select fluid_goal_ml from older_adults`)).rows[0].fluid_goal_ml === 1500);
ok('caregiver can change fluid goal', (await as(C, `update older_adults set fluid_goal_ml = 2000 returning id`)).rows.length === 1);
const team = (await as(F, `select full_name, role from team_members where older_adult_id = $1 order by full_name`, [oa])).rows;
ok('family sees care team with names', JSON.stringify(team.map((r) => r.full_name)) === JSON.stringify(['Carla', 'Fam']), team);
ok('outsider sees no team', (await as(O, `select * from team_members`)).rows.length === 0);

console.log('appointments & visits');
const appt = (await as(F, `insert into appointments (older_adult_id, title, starts_at, created_by, needs_companion) values ($1, 'Control de tensión', now() + interval '5 days', $2, true) returning id`, [oa, F])).rows[0].id;
ok('family can add an appointment', !!appt);
ok('caregiver sees it', (await as(C, `select * from appointments where id = $1`, [appt])).rows.length === 1);
ok('caregiver can cancel it', (await as(C, `update appointments set status = 'cancelled' where id = $1 returning updated_at`, [appt])).rows.length === 1);
ok('outsider cannot see it', (await as(O, `select * from appointments`)).rows.length === 0);
ok('outsider cannot add one', !!(await fails(O, `insert into appointments (older_adult_id, title, starts_at, created_by) values ($1, 'x', now(), $2)`, [oa, O])));
ok('appointments cannot be deleted', !!(await fails(F, `delete from appointments where id = $1`, [appt])));
await ins(C, 'visit_events', { ...base(), kind: 'arrival' });
ok('family cannot log a visit', !!(await ins(F, 'visit_events', { ...base(), recorded_by: F, kind: 'arrival' }).then(() => null, (e) => e.message)));
const visitRows = (await as(F, `select data->>'kind' k, recorded_by_name from activity where kind = 'visit'`)).rows;
ok('visits appear in the timeline with the caregiver name', visitRows.length === 1 && visitRows[0].k === 'arrival' && visitRows[0].recorded_by_name === 'Carla', visitRows);

console.log('medical documents');
const docId = randomUUID();
await as(F, `insert into medical_documents (id, older_adult_id, uploaded_by, storage_path, mime_type) values ($1, $2, $3, $4, 'application/pdf')`, [docId, oa, F, `${oa}/${docId}.pdf`]);
ok('family can upload a document', (await as(C, `select status from medical_documents where id = $1`, [docId])).rows[0]?.status === 'processing');
ok('caregiver can upload a document', !!(await as(C, `insert into medical_documents (id, older_adult_id, uploaded_by, storage_path, mime_type) values ($1, $2, $3, $4, 'image/jpeg') returning id`, [randomUUID(), oa, C, `${oa}/x.jpg`])).rows.length);
ok('path must be inside the person folder', !!(await fails(F, `insert into medical_documents (id, older_adult_id, uploaded_by, storage_path, mime_type) values ($1, $2, $3, 'other/x.pdf', 'application/pdf')`, [randomUUID(), oa, F])));
ok('users cannot fake transcription results', !!(await fails(F, `update medical_documents set status = 'ready', results = '[]' where id = $1`, [docId])));
ok('users can correct the title', (await as(F, `update medical_documents set title = 'Análisis de sangre' where id = $1 returning id`, [docId])).rows.length === 1);
ok('outsider cannot see documents', (await as(O, `select * from medical_documents`)).rows.length === 0);
ok('outsider cannot upload for the person', !!(await fails(O, `insert into medical_documents (id, older_adult_id, uploaded_by, storage_path, mime_type) values ($1, $2, $3, $4, 'application/pdf')`, [randomUUID(), oa, O, `${oa}/y.pdf`])));
await as(F, `insert into storage.objects (bucket_id, name) values ('medical-documents', $1)`, [`${oa}/${docId}.pdf`]);
ok('team member can store the file', (await as(C, `select * from storage.objects where name = $1`, [`${oa}/${docId}.pdf`])).rows.length === 1);
ok('outsider cannot read the file', (await as(O, `select * from storage.objects`)).rows.length === 0);
ok('outsider cannot store files in the person folder', !!(await fails(O, `insert into storage.objects (bucket_id, name) values ('medical-documents', $1)`, [`${oa}/z.pdf`])));
ok('malformed paths are denied, not errors', !!(await fails(F, `insert into storage.objects (bucket_id, name) values ('medical-documents', 'not-a-uuid/z.pdf')`)));

console.log('protections');
ok('cannot change own role', !!(await fails(C, `update profiles set role = 'family' where id = $1`, [C])));
ok('can record consent', (await as(C, `update profiles set consented_at = now(), consent_version = 'x' where id = $1 returning id`, [C])).rows.length === 1);
ok('family cannot edit person', (await as(F, `update older_adults set nickname = 'Hacked' returning id`)).rows.length === 0);
ok('logs are append-only (no update)', !!(await fails(C, `update check_ins set mood = 1`)));
ok('logs are append-only (no delete)', !!(await fails(C, `delete from check_ins`)));
ok('anon sees nothing', !!(await db.transaction(async (tx) => { await tx.exec('set local role anon'); return tx.query('select * from activity'); }).then(() => null, (e) => e.message)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
