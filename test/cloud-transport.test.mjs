import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCloudConfig } from '../public/shared/cloud-config.js'
import { createCloudConnection, flushOne } from '../public/shared/cloud-transport.js'
import { openProgressStore } from '../public/shared/progress-store.js'
import { IDBFactory } from 'fake-indexeddb'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const P = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const config = parseCloudConfig({ enabled: true, url: 'https://cloud.example', publishableKey: 'sb_publishable_synthetic_test_key_00000000000' })
const binding = { backend: config.backend, ownerId: A, profileId: P }
const snapshot = (streak = 0) => ({ formatVersion: 1, streak })
const normalize = (value) => {
  if (!value || value.formatVersion !== 1 || !Number.isInteger(value.streak)) throw new Error('Invalid snapshot')
  return snapshot(value.streak)
}
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r }); return { promise, resolve } }
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' } })
function session(owner) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const expires = Math.floor(Date.now() / 1000) + 3600
  const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'adult@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2030-01-01T00:00:00.000Z' }
  return { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, exp: expires, role: 'authenticated' })}.synthetic`, token_type: 'bearer', expires_in: 3600, expires_at: expires, refresh_token: 'synthetic-refresh-token', user }
}
// Real pinned SDK, invented HTTP responses. No global fetch is called. SQL/RLS
// authorization has its own real PostgreSQL harness, not this response double.
function endpoint() {
  const api = { owner: A, row: null, calls: [], before: null, loseNextWrite: false, afterWrite: null }
  api.fetch = async (input, init) => {
    const url = new URL(input)
    const body = init.body ? JSON.parse(init.body) : null
    const method = init.method ?? 'GET'
    api.calls.push({ url: url.href, method, body, signal: init.signal, credentials: init.credentials, redirect: init.redirect })
    if (api.before) await api.before(url, init)
    if (url.pathname === '/auth/v1/otp') return json({})
    if (url.pathname === '/auth/v1/verify') {
      if (api.verifyFailure === 'offline') throw new TypeError('Synthetic network unavailable')
      if (api.verifyFailure) return json({ code: api.verifyFailure.code, msg: 'Synthetic auth error' }, api.verifyFailure.status)
      return json(session(api.owner))
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      const headers = new Headers(init.headers)
      assert.equal(headers.get('apikey'), config.publishableKey)
      assert.match(headers.get('authorization'), /^Bearer ey/)
    }
    if (url.pathname === '/rest/v1/learning_profiles') return json([{ owner_id: api.owner, id: P, label: 'Avery' }])
    if (url.pathname !== '/rest/v1/learning_saves') throw new Error('Unexpected synthetic request path')
    if (method === 'GET') return json(api.row ? [structuredClone(api.row)] : [])
    if (method === 'POST' && api.row) return json({ code: '23505', message: 'duplicate' }, 409)
    if (method === 'PATCH' && (!api.row || url.searchParams.get('revision') !== `eq.${api.row.revision}`)) return json([])
    api.row = { owner_id: api.owner, profile_id: P, game_id: 'target', curriculum_id: 'test-v1', ...body, revision: (api.row?.revision ?? 0) + 1 }
    const saved = structuredClone(api.row)
    if (api.afterWrite) await api.afterWrite()
    if (api.loseNextWrite) { api.loseNextWrite = false; throw new TypeError('Synthetic response lost after commit') }
    return json([saved])
  }
  return api
}
async function connect(api = endpoint(), options = {}) {
  const connection = createCloudConnection(config, { gameId: 'target', curriculumId: 'test-v1', normalize, loadSDK: () => import('@supabase/supabase-js'), nativeFetch: api.fetch, ...options })
  await connection.ready
  return { connection, api }
}
async function login(connection) {
  await connection.sendCode('adult@example.invalid')
  await connection.verifyCode('12345678')
}

test('disabled and malformed host configuration never loads the SDK', () => {
  for (const raw of [undefined, {}, { enabled: false }, { enabled: 'true' }]) assert.equal(parseCloudConfig(raw), null)
  for (const url of ['http://cloud.example', 'https://name:password@cloud.example', 'https://cloud.example/path', 'https://cloud.example?key=secret', 'https://cloud.example/#other']) {
    assert.throws(() => parseCloudConfig({ enabled: true, url, publishableKey: config.publishableKey }), /HTTPS/)
  }
  for (const publishableKey of ['', 'sb_secret_not_for_a_browser', 'eyJlegacy']) assert.throws(() => parseCloudConfig({ enabled: true, url: config.backend, publishableKey }), /publishable/)
  let loaded = false
  assert.throws(() => createCloudConnection({ ...config, backend: 'http://cloud.example' }, { loadSDK: () => { loaded = true } }), /HTTPS/)
  assert.equal(loaded, false)
})

test('memory-only SDK initialization and disconnection make zero requests', async () => {
  const { connection, api } = await connect()
  assert.equal(api.calls.length, 0)
  connection.disconnect()
  assert.equal(api.calls.length, 0)
})

test('disconnect during lazy import never constructs a client', async () => {
  const gate = deferred()
  let constructed = false
  const connection = createCloudConnection(config, { gameId: 'target', curriculumId: 'test-v1', normalize, loadSDK: () => gate.promise })
  connection.disconnect()
  gate.resolve({ createClient: () => { constructed = true } })
  await assert.rejects(connection.ready, { code: 'disconnected' })
  assert.equal(constructed, false)
})

test('OTP is adult opt-in, held in memory and cancelled before late verification can attach an account', async () => {
  const { connection, api } = await connect()
  await connection.sendCode('adult@example.invalid')
  assert.equal(api.calls[0].body.email, 'adult@example.invalid')
  assert.equal(api.calls[0].body.create_user, true)
  await assert.rejects(connection.sendCode('different@example.invalid'), { code: 'new-connection' })
  await assert.rejects(connection.sendCode('adult@example.invalid'), { code: 'cooldown' })
  const entered = deferred(), release = deferred()
  api.before = async (url) => { if (url.pathname.endsWith('/verify')) { entered.resolve(); await release.promise } }
  const pending = connection.verifyCode('12345678')
  await entered.promise
  connection.disconnect()
  assert.equal(api.calls.at(-1).signal.aborted, true)
  release.resolve() // Deliberately return a response despite abort.
  await assert.rejects(pending, { code: 'disconnected' })
  assert.equal(connection.ownerId, null)
  await assert.rejects(connection.listProfiles(), { code: 'disconnected' })
  assert.equal(api.calls.length, 2)
})

test('the authenticated owner and full binding constrain all reads', async () => {
  const { connection, api } = await connect()
  await login(connection)
  assert.equal(connection.ownerId, A)
  assert.deepEqual(await connection.listProfiles(), [{ id: P, label: 'Avery' }])
  assert.equal(await connection.read(binding), null)
  const request = new URL(api.calls.at(-1).url)
  assert.equal(request.searchParams.get('owner_id'), `eq.${A}`)
  assert.equal(request.searchParams.get('profile_id'), `eq.${P}`)
  assert.equal(request.searchParams.get('game_id'), 'eq.target')
  assert.equal(request.searchParams.get('curriculum_id'), 'eq.test-v1')
  const count = api.calls.length
  await assert.rejects(connection.read({ ...binding, ownerId: B }), { code: 'auth-required' })
  await assert.rejects(connection.read({ ...binding, backend: 'https://different.example' }), { code: 'auth-required' })
  assert.equal(api.calls.length, count)
  assert.equal(api.calls.every((call) => call.credentials === 'omit' && call.redirect === 'error'), true)
  connection.disconnect()
})

test('wrong codes, throttling and network failures retain distinct recovery instructions', async () => {
  for (const [failure, expected] of [[{ status: 403, code: 'otp_expired' }, 'invalid-code'], [{ status: 429, code: 'over_email_send_rate_limit' }, 'rate-limit'], ['offline', 'unavailable']]) {
    const { connection, api } = await connect()
    await connection.sendCode('adult@example.invalid')
    api.verifyFailure = failure
    await assert.rejects(connection.verifyCode('12345678'), { code: expected })
    assert.equal(connection.ownerId, null)
    connection.disconnect()
  }
})

test('an interrupted committed write reconciles by write ID; it is not applied twice', async () => {
  const { connection, api } = await connect()
  await login(connection)
  const attempt = { writeId: crypto.randomUUID(), expectedRemoteRevision: 0, snapshot: snapshot(2) }
  api.loseNextWrite = true
  await assert.rejects(connection.write(binding, attempt), { code: 'unavailable' })
  assert.equal(api.row.revision, 1)
  const retry = await connection.write(binding, attempt)
  assert.equal(retry.status, 'saved')
  assert.equal(retry.remote.revision, 1)
  assert.equal(api.calls.filter((call) => call.method === 'POST' && call.url.includes('learning_saves')).length, 1)
  // A wrong-answer reset is a real newer snapshot, not a max-streak merge.
  const reset = await connection.write(binding, { writeId: crypto.randomUUID(), expectedRemoteRevision: 1, snapshot: snapshot(0) })
  assert.equal(reset.remote.snapshot.streak, 0)
  assert.equal(reset.remote.revision, 2)
  connection.disconnect()
})

test('another device produces a conflict without any overwrite request', async () => {
  const { connection, api } = await connect()
  await login(connection)
  await connection.write(binding, { writeId: crypto.randomUUID(), expectedRemoteRevision: 0, snapshot: snapshot(2) })
  const before = api.calls.length
  const result = await connection.write(binding, { writeId: crypto.randomUUID(), expectedRemoteRevision: 0, snapshot: snapshot(0) })
  assert.equal(result.status, 'conflict')
  assert.equal(result.remote.snapshot.streak, 2)
  assert.equal(api.calls.length, before + 1)
  assert.equal(api.calls.at(-1).method, 'GET')
  connection.disconnect()
})

test('unknown cloud formats and mismatched acknowledgements leave local progress intact', async () => {
  const { connection, api } = await connect()
  await login(connection)
  const attempt = { writeId: crypto.randomUUID(), expectedRemoteRevision: 0, snapshot: snapshot(2) }
  await connection.write(binding, attempt)
  api.row.snapshot = snapshot(0)
  await assert.rejects(connection.write(binding, attempt), { code: 'invalid' })
  api.row.snapshot = { formatVersion: 2, streak: 1 }
  api.row.format_version = 2
  await assert.rejects(connection.read(binding), { code: 'invalid' })
  connection.disconnect()
})

test('disconnect during REST cannot acknowledge the durable queue, even if the server committed', async () => {
  const { connection, api } = await connect()
  await login(connection)
  const store = await openProgressStore({ indexedDB: new IDBFactory(), gameId: 'target', curriculumId: 'test-v1', normalize })
  const profile = await store.createProfile('Avery', snapshot())
  await store.attach(profile.id, binding, 1, null, 'device')
  const entered = deferred(), release = deferred()
  api.afterWrite = async () => { entered.resolve(); await release.promise }
  const pending = flushOne(store, profile.id, connection)
  await entered.promise
  connection.disconnect()
  release.resolve()
  await assert.rejects(pending, { code: 'disconnected' })
  const record = await store.load(profile.id)
  assert.equal(record.needsUpload, true)
  assert.equal(record.remoteRevision, 0)
  assert.equal(record.inflight.writeId, api.row.write_id)
  api.afterWrite = null
  const second = (await connect(api)).connection
  await login(second)
  assert.equal((await flushOne(store, profile.id, second)).status, 'saved')
  assert.equal((await store.load(profile.id)).needsUpload, false)
  assert.equal(api.row.revision, 1)
  second.disconnect(); store.close()
})

test('a signed-in second account cannot flush the first account’s pending local profile', async () => {
  const api = endpoint()
  api.owner = B
  const { connection } = await connect(api)
  await login(connection)
  const store = await openProgressStore({ indexedDB: new IDBFactory(), gameId: 'target', curriculumId: 'test-v1', normalize })
  const profile = await store.createProfile('Avery', snapshot())
  await store.attach(profile.id, binding, 1, null, 'device')
  const before = api.calls.length
  assert.equal((await flushOne(store, profile.id, connection)).status, 'disconnected')
  assert.equal(api.calls.length, before)
  assert.equal((await store.load(profile.id)).needsUpload, true)
  connection.disconnect(); store.close()
})

test('a committed math save still reconciles after JSON object keys are reordered by the database',async()=>{
  const {cleanProgress,normalizeSnapshot}=await import('../public/shared/snapshot.js');
  const {connection,api}=await connect(endpoint(),{normalize:value=>normalizeSnapshot('target',value)});
  try {
    await login(connection);
    const value=cleanProgress('target',{solved:3,items:{t8:{attempts:2,correct:2,streak:2},t6:{attempts:1,correct:1,streak:1}}});
    const attempt={writeId:crypto.randomUUID(),expectedRemoteRevision:0,snapshot:value};
    api.loseNextWrite=true;
    await assert.rejects(connection.write(binding,attempt),{code:'unavailable'});
    // JSON objects have no significant key order; PostgreSQL JSONB can return
    // a different order from the original sequence in which cards were played.
    api.row.snapshot.items=Object.fromEntries(Object.entries(api.row.snapshot.items).reverse());
    const recovered=await connection.write(binding,attempt);
    assert.equal(recovered.status,'saved');assert.equal(recovered.remote.revision,1);
    assert.equal(api.calls.filter(call=>call.method==='POST'&&call.url.includes('learning_saves')).length,1);
  } finally {connection.disconnect()}
});
