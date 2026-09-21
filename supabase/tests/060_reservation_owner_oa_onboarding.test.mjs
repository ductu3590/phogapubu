// BL-2B Task 2 — claim mã onboarding nguyên tử, đúng app/OA/store.
import { after, afterEach, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const pgliteModule = process.env.PGLITE_MODULE
  ? process.env.PGLITE_MODULE.startsWith('file:')
    ? process.env.PGLITE_MODULE
    : pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const store = id(10)
const otherStore = id(11)
const superadmin = id(1)
const codeHash = 'a'.repeat(64)

async function asService(sql, params = []) {
  await db.exec('SET LOCAL ROLE service_role')
  try {
    return await db.query(sql, params)
  } finally {
    await db.exec('RESET ROLE')
  }
}

async function createChallenge(targetStore = store, hash = codeHash) {
  return (await asService(`
    SELECT create_zalo_oa_onboarding_challenge(
      $1, $2, $3, now() + interval '15 minutes'
    ) AS value
  `, [targetStore, hash, superadmin])).rows[0].value
}

async function claim(overrides = {}) {
  const input = {
    storeId: store,
    appId: 'app-a',
    oaId: 'oa-a',
    oaUserId: 'owner-uid-a',
    messageId: 'message-a',
    hash: codeHash,
    ...overrides,
  }
  return (await asService(`
    SELECT claim_zalo_oa_onboarding_challenge($1, $2, $3, $4, $5, $6) AS value
  `, [input.storeId, input.appId, input.oaId, input.oaUserId, input.messageId, input.hash])).rows[0].value
}

before(async () => {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE SCHEMA extensions;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION extensions.digest(p_value text, p_algorithm text) RETURNS bytea
      LANGUAGE sql IMMUTABLE STRICT AS $$
        SELECT decode(md5(p_value) || md5('reservation-token:' || p_value), 'hex')
      $$;

    CREATE TABLE stores (
      id uuid PRIMARY KEY, name text NOT NULL, zalo_oa_id text,
      is_active boolean NOT NULL DEFAULT true,
      is_accepting_orders boolean NOT NULL DEFAULT true,
      serving_hours jsonb NOT NULL DEFAULT '[]'::jsonb
    );
    CREATE TABLE store_app_configs (
      store_id uuid PRIMARY KEY REFERENCES stores(id),
      zalo_mini_app_id text
    );
    CREATE TABLE tables (
      id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id),
      table_number text NOT NULL, is_active boolean NOT NULL DEFAULT true,
      UNIQUE(id, store_id)
    );
    CREATE TABLE table_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES stores(id),
      table_id uuid REFERENCES tables(id), status text NOT NULL DEFAULT 'open'
    );
    CREATE TABLE store_workflow_settings (
      store_id uuid PRIMARY KEY REFERENCES stores(id), reservations_enabled boolean NOT NULL DEFAULT true,
      reservation_preorder_enabled boolean NOT NULL DEFAULT true,
      minimum_advance_minutes integer NOT NULL DEFAULT 30, booking_horizon_days integer NOT NULL DEFAULT 7,
      slot_interval_minutes integer NOT NULL DEFAULT 15, default_table_capacity integer NOT NULL DEFAULT 6,
      planning_hold_minutes integer NOT NULL DEFAULT 180,
      reservation_preorder_edit_cutoff_minutes integer NOT NULL DEFAULT 30
    );
    CREATE TABLE store_zalo_configs (
      store_id uuid PRIMARY KEY REFERENCES stores(id), zalo_oa_access_token text,
      zalo_app_secret_key text, is_enabled boolean NOT NULL DEFAULT true
    );
    CREATE FUNCTION is_store_scoped_operator(p_store_id uuid) RETURNS boolean
      LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE PUBLICATION supabase_realtime;

    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    INSERT INTO auth.users(id) VALUES ('${superadmin}');
    INSERT INTO stores(id, name, zalo_oa_id, serving_hours) VALUES
      ('${store}', 'Bảo Lương', 'oa-a', '[{"open":"11:00","close":"22:00"}]'),
      ('${otherStore}', 'Quán khác', 'oa-b', '[{"open":"11:00","close":"22:00"}]');
    INSERT INTO store_app_configs(store_id, zalo_mini_app_id) VALUES
      ('${store}', 'app-a'), ('${otherStore}', 'app-b');
    INSERT INTO store_workflow_settings(store_id) VALUES ('${store}'), ('${otherStore}');
    INSERT INTO store_zalo_configs(store_id, zalo_oa_access_token, zalo_app_secret_key, is_enabled) VALUES
      ('${store}', 'token-a', 'secret-a', true),
      ('${otherStore}', 'token-b', 'secret-b', true);
  `)

  for (const migration of [
    '052_reservation_schema.sql',
    '053_reservation_customer_rpcs.sql',
    '059_reservation_owner_oa_notifications.sql',
    '059a_reservation_owner_oa_notification_indexes.sql',
    '060_reservation_owner_oa_onboarding.sql',
  ]) {
    try {
      await db.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
})

beforeEach(async () => { await db.exec('BEGIN') })
afterEach(async () => { await db.exec('ROLLBACK'); await db.exec('RESET ROLE') })
after(async () => { await db.close() })

test('challenge chỉ lưu hash, hết hạn sau tối đa 20 phút và vô hiệu mã cũ', async () => {
  const first = await createChallenge()
  const second = await createChallenge(store, 'b'.repeat(64))
  assert.notEqual(first, second)

  const rows = (await db.query(`
    SELECT id, code_hash, claimed_at, expires_at <= created_at + interval '20 minutes' AS bounded
    FROM zalo_oa_onboarding_challenges
    WHERE store_id = $1
  `, [store])).rows
  assert.equal(rows.length, 2)
  const byId = new Map(rows.map((row) => [row.id, row]))
  assert.equal(byId.get(first).claimed_at !== null, true)
  assert.equal(byId.get(second).code_hash, 'b'.repeat(64))
  assert.equal(byId.get(second).bounded, true)
  assert.equal(JSON.stringify(rows).includes('MEVO'), false)
})

test('claim hợp lệ xác minh đúng một recipient thuộc app/OA/store', async () => {
  const challengeId = await createChallenge()
  const result = await claim()
  assert.equal(result.status, 'claimed')

  const recipient = (await db.query(`
    SELECT store_id, oa_id, oa_user_id, status, verified_at
    FROM store_zalo_notification_recipients
    WHERE store_id = $1
  `, [store])).rows[0]
  assert.equal(recipient.store_id, store)
  assert.equal(recipient.oa_id, 'oa-a')
  assert.equal(recipient.oa_user_id, 'owner-uid-a')
  assert.equal(recipient.status, 'verified')
  assert.notEqual(recipient.verified_at, null)

  const challenge = (await db.query(`
    SELECT claimed_at, provider_message_id, recipient_id
    FROM zalo_oa_onboarding_challenges WHERE id = $1
  `, [challengeId])).rows[0]
  assert.notEqual(challenge.claimed_at, null)
  assert.equal(challenge.provider_message_id, 'message-a')
  assert.equal(challenge.recipient_id, result.recipient_id)
})

test('app/OA/store/code sai hoặc challenge hết hạn không thể claim', async () => {
  await createChallenge()
  for (const overrides of [
    { appId: 'app-other' },
    { oaId: 'oa-other' },
    { storeId: otherStore },
    { hash: 'f'.repeat(64) },
  ]) {
    assert.equal((await claim(overrides)).status, 'invalid')
  }

  await db.query(`
    UPDATE zalo_oa_onboarding_challenges
    SET expires_at = now() - interval '1 second', created_at = now() - interval '20 minutes'
    WHERE store_id = $1 AND claimed_at IS NULL
  `, [store])
  assert.equal((await claim()).status, 'invalid')
  assert.equal((await db.query(`
    SELECT count(*)::integer AS n FROM store_zalo_notification_recipients
    WHERE store_id = $1 AND status = 'verified'
  `, [store])).rows[0].n, 0)
})

test('message lặp là replay; cùng code với message khác không claim lần hai', async () => {
  await createChallenge()
  assert.equal((await claim()).status, 'claimed')
  assert.equal((await claim()).status, 'replay')
  assert.equal((await claim({ messageId: 'message-b', oaUserId: 'attacker' })).status, 'invalid')
  assert.equal((await db.query(`
    SELECT count(*)::integer AS n FROM store_zalo_notification_recipients WHERE store_id = $1
  `, [store])).rows[0].n, 1)
})

test('RPC onboarding chỉ cấp service_role', async () => {
  const privileges = (await db.query(`
    SELECT
      has_function_privilege('anon', 'public.create_zalo_oa_onboarding_challenge(uuid,text,uuid,timestamptz)', 'EXECUTE') AS anon_create,
      has_function_privilege('authenticated', 'public.claim_zalo_oa_onboarding_challenge(uuid,text,text,text,text,text)', 'EXECUTE') AS auth_claim,
      has_function_privilege('service_role', 'public.create_zalo_oa_onboarding_challenge(uuid,text,uuid,timestamptz)', 'EXECUTE') AS service_create,
      has_function_privilege('service_role', 'public.claim_zalo_oa_onboarding_challenge(uuid,text,text,text,text,text)', 'EXECUTE') AS service_claim
  `)).rows[0]
  assert.deepEqual(privileges, {
    anon_create: false,
    auth_claim: false,
    service_create: true,
    service_claim: true,
  })
})
