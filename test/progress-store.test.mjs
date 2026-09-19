import test from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { openProgressStore } from '../public/shared/progress-store.js'

const binding = { backend: 'https://cloud.example', ownerId: '11111111-1111-4111-8111-111111111111', profileId: '22222222-2222-4222-8222-222222222222' }
const snapshot = (streak = 0) => ({ formatVersion: 1, streak })
async function setup() {
  const indexedDB = new IDBFactory()
  const options = { indexedDB, dbName: 'test', gameId: 'target', curriculumId: 'test-v1', normalize: (v) => {
    if (!v || v.formatVersion !== 1 || !Number.isInteger(v.streak)) throw new Error('Invalid snapshot')
    return snapshot(v.streak)
  } }
  const store = await openProgressStore(options)
  const profile = await store.createProfile('Avery', snapshot())
  return { store, profile, options }
}

test('same names are independent local profiles; initial snapshot is saved atomically', async () => {
  const { store, profile } = await setup()
  const other = await store.createProfile('Avery', snapshot(2))
  assert.notEqual(profile.id, other.id)
  assert.equal((await store.load(profile.id)).snapshot.streak, 0)
  assert.equal((await store.load(other.id)).snapshot.streak, 2)
  assert.equal((await store.listProfiles()).length, 2)
  store.close()
})

test('a failed record write rolls back profile creation', async () => {
  const { store } = await setup()
  const original = IDBObjectStore.prototype.put
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'records') throw new DOMException('Full', 'QuotaExceededError')
    return original.apply(this, args)
  }
  try { await assert.rejects(store.createProfile('Casey', snapshot()), { name: 'QuotaExceededError' }) }
  finally { IDBObjectStore.prototype.put = original }
  assert.equal((await store.listProfiles()).length, 1)
  store.close()
})

test('the ninth profile is rejected without evicting anybody', async () => {
  const { store } = await setup()
  for (let i = 0; i < 7; i++) await store.createProfile(`Learner ${i}`, snapshot())
  await assert.rejects(store.createProfile('Ninth', snapshot()), /eight/)
  assert.equal((await store.listProfiles()).length, 8)
  store.close()
})

test('local save ignores extra fields and a reload retains pending work', async () => {
  const { store, profile, options } = await setup()
  let record = await store.load(profile.id)
  record = (await store.attach(profile.id, binding, record.localRevision, null, 'device')).record
  const result = await store.save(profile.id, { ...snapshot(2), email: 'excluded@example.invalid' }, record.localRevision)
  assert.equal(result.status, 'saved')
  store.close()
  const reopened = await openProgressStore(options)
  record = await reopened.load(profile.id)
  assert.deepEqual(record.snapshot, snapshot(2))
  assert.equal(record.needsUpload, true)
  assert.deepEqual(record.binding, binding)
  reopened.close()
})

test('two tabs cannot overwrite each other; losing edit is recoverable', async () => {
  const { store, profile, options } = await setup()
  const other = await openProgressStore(options)
  const original = await store.load(profile.id)
  await store.save(profile.id, snapshot(1), original.localRevision)
  const lost = await other.save(profile.id, snapshot(2), original.localRevision)
  assert.equal(lost.status, 'local-conflict')
  assert.equal((await store.load(profile.id)).snapshot.streak, 1)
  assert.equal((await other.listRecovery(profile.id))[0].snapshot.streak, 2)
  store.close(); other.close()
})

test('in-flight payload survives reload and newer answers; acknowledgement does not drop later edits', async () => {
  const { store, profile, options } = await setup()
  let record = await store.load(profile.id)
  record = (await store.attach(profile.id, binding, record.localRevision, null, 'device')).record
  const first = await store.beginFlush(profile.id, binding)
  await store.save(profile.id, snapshot(1), record.localRevision)
  store.close()
  const reloaded = await openProgressStore(options)
  const retry = await reloaded.beginFlush(profile.id, binding)
  assert.deepEqual(retry.inflight, first.inflight)
  assert.equal(retry.inflight.snapshot.streak, 0)
  await reloaded.acknowledge(profile.id, binding, first.inflight.writeId, 1)
  const second = await reloaded.beginFlush(profile.id, binding)
  assert.equal(second.inflight.expectedRemoteRevision, 1)
  assert.equal(second.inflight.snapshot.streak, 1)
  assert.notEqual(second.inflight.writeId, first.inflight.writeId)
  await reloaded.acknowledge(profile.id, binding, second.inflight.writeId, 2)
  assert.equal(await reloaded.beginFlush(profile.id, binding), null)
  reloaded.close()
})

test('account or backend changes cannot upload or acknowledge another binding', async () => {
  const { store, profile } = await setup()
  let record = await store.load(profile.id)
  record = (await store.attach(profile.id, binding, record.localRevision, null, 'device')).record
  const first = await store.beginFlush(profile.id, binding)
  const otherAccount = { ...binding, ownerId: '33333333-3333-4333-8333-333333333333' }
  const otherBackend = { ...binding, backend: 'https://other.example' }
  assert.equal(await store.beginFlush(profile.id, otherAccount), null)
  assert.equal(await store.beginFlush(profile.id, otherBackend), null)
  assert.equal((await store.acknowledge(profile.id, otherAccount, first.inflight.writeId, 1)).status, 'stale')
  await store.attach(profile.id, otherAccount, record.localRevision, null, 'device')
  assert.equal((await store.acknowledge(profile.id, binding, first.inflight.writeId, 1)).status, 'stale')
  assert.deepEqual((await store.load(profile.id)).binding, otherAccount)
  store.close()
})

test('remote conflict is explicit; keeping the device preserves lower streaks and cloud recovery', async () => {
  const { store, profile } = await setup()
  let record = await store.load(profile.id)
  record = (await store.attach(profile.id, binding, record.localRevision, null, 'device')).record
  const first = await store.beginFlush(profile.id, binding)
  const remote = { snapshot: snapshot(2), revision: 4, writeId: crypto.randomUUID() }
  await store.markConflict(profile.id, binding, first.inflight.writeId, remote)
  assert.equal(await store.beginFlush(profile.id, binding), null)
  const conflictId = (await store.load(profile.id)).conflict.id
  const resolved = await store.resolveConflict(profile.id, binding, record.localRevision, 'device', conflictId)
  assert.equal(resolved.record.snapshot.streak, 0)
  assert.equal(resolved.record.remoteRevision, 4)
  assert.equal((await store.listRecovery(profile.id))[0].snapshot.streak, 2)
  assert.equal((await store.beginFlush(profile.id, binding)).inflight.expectedRemoteRevision, 4)
  store.close()
})

test('using cloud progress keeps the replaced local snapshot for recovery', async () => {
  const { store, profile } = await setup()
  const record = await store.load(profile.id)
  const remote = { snapshot: snapshot(2), revision: 7, writeId: crypto.randomUUID() }
  await assert.rejects(store.attach(profile.id, binding, record.localRevision, remote), /Choose/)
  const result = await store.attach(profile.id, binding, record.localRevision, remote, 'cloud')
  assert.equal(result.record.snapshot.streak, 2)
  assert.equal(result.record.needsUpload, false)
  assert.equal((await store.listRecovery(profile.id))[0].snapshot.streak, 0)
  store.close()
})

test('stale conflict choices do not discard a newer local answer', async () => {
  const { store, profile } = await setup()
  let record = await store.load(profile.id)
  record = (await store.attach(profile.id, binding, record.localRevision, null, 'device')).record
  const first = await store.beginFlush(profile.id, binding)
  await store.markConflict(profile.id, binding, first.inflight.writeId, { snapshot: snapshot(2), revision: 3, writeId: crypto.randomUUID() })
  await store.save(profile.id, snapshot(1), record.localRevision)
  const stale = await store.resolveConflict(profile.id, binding, record.localRevision, 'cloud')
  assert.equal(stale.status, 'local-conflict')
  assert.equal((await store.load(profile.id)).snapshot.streak, 1)
  store.close()
})

test('removing a local profile cancels its pending work without deleting other profiles', async () => {
  const { store, profile } = await setup()
  const other = await store.createProfile('Casey', snapshot(1))
  await store.removeProfile(profile.id)
  assert.equal(await store.load(profile.id), null)
  assert.equal(await store.beginFlush(profile.id, binding), null)
  assert.equal((await store.load(other.id)).snapshot.streak, 1)
  await assert.rejects(store.save(profile.id, snapshot(), 1), /profile/)
  store.close()
})

test('a conflict choice must refer to the exact cloud version shown to the user', async () => {
  const { store, profile } = await setup()
  const original = await store.load(profile.id)
  const attached = (await store.attach(profile.id, binding, original.localRevision, null, 'device')).record
  const pending = await store.beginFlush(profile.id, binding)
  const remote3 = { snapshot: snapshot(1), revision: 3, writeId: crypto.randomUUID() }
  const remote4 = { snapshot: snapshot(2), revision: 4, writeId: crypto.randomUUID() }
  await store.markConflict(profile.id, binding, pending.inflight.writeId, remote3)
  const displayed = await store.load(profile.id)
  await store.markConflict(profile.id, binding, pending.inflight.writeId, remote4)
  const result = await store.resolveConflict(profile.id, binding, attached.localRevision, 'cloud', displayed.conflict.id)
  assert.equal(result.status, 'stale')
  assert.equal((await store.load(profile.id)).snapshot.streak, 0)
  await store.markConflict(profile.id, binding, pending.inflight.writeId, remote3)
  assert.equal((await store.load(profile.id)).conflict.remote.revision, 4)
  store.close()
})

test('missing remote snapshots cannot be normalized into a new learner', async () => {
  const store = await openProgressStore({ indexedDB: new IDBFactory(), gameId: 'target', curriculumId: 'test-v1', normalize: (value) => value ?? snapshot() })
  const profile = await store.createProfile('Avery', snapshot(2))
  const record = await store.load(profile.id)
  await assert.rejects(async () => store.attach(profile.id, binding, record.localRevision, { revision: 1, writeId: crypto.randomUUID() }, 'cloud'), /Invalid cloud progress/)
  assert.equal((await store.load(profile.id)).snapshot.streak, 2)
  store.close()
})
