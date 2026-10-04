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

console.log('protections');
ok('cannot change own role', !!(await fails(C, `update profiles set role = 'family' where id = $1`, [C])));
ok('can record consent', (await as(C, `update profiles set consented_at = now(), consent_version = 'x' where id = $1 returning id`, [C])).rows.length === 1);
ok('family cannot edit person', (await as(F, `update older_adults set nickname = 'Hacked' returning id`)).rows.length === 0);
ok('logs are append-only (no update)', !!(await fails(C, `update check_ins set mood = 1`)));
ok('logs are append-only (no delete)', !!(await fails(C, `delete from check_ins`)));
ok('anon sees nothing', !!(await db.transaction(async (tx) => { await tx.exec('set local role anon'); return tx.query('select * from activity'); }).then(() => null, (e) => e.message)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
