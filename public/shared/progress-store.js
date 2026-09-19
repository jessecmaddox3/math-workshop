// Local snapshots and their cloud outbox commit together. Names are labels, not keys.
export const MAX_PROFILES = 8
const MAX_SNAPSHOT_BYTES = 1048576
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const clone = (value) => structuredClone(value)
export const sameBinding = (a, b) => !!a && !!b && a.backend === b.backend && a.ownerId === b.ownerId && a.profileId === b.profileId

export function validateBinding(value) {
  if (!value || !UUID.test(value.ownerId) || !UUID.test(value.profileId)) throw new TypeError('Invalid cloud profile.')
  const url = new URL(value.backend)
  if (url.protocol !== 'https:' || url.origin !== value.backend || url.username || url.password) throw new TypeError('Invalid cloud destination.')
  return { backend: url.origin, ownerId: value.ownerId, profileId: value.profileId }
}

export async function openProgressStore({ indexedDB = globalThis.indexedDB, dbName = 'color-learning-v1', gameId, curriculumId, normalize }) {
  if (!indexedDB) throw new Error('This browser cannot save progress on this device.')
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1)
    request.onupgradeneeded = () => {
      const next = request.result
      next.createObjectStore('profiles', { keyPath: 'id' })
      next.createObjectStore('records', { keyPath: 'key' })
      const recovery = next.createObjectStore('recovery', { keyPath: 'id' })
      recovery.createIndex('profileId', 'profileId')
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Close older tabs before updating saved progress.'))
    request.onsuccess = () => resolve(request.result)
  })
  db.onversionchange = () => db.close()

  const keyFor = (id) => JSON.stringify([id, gameId, curriculumId])
  const clean = (value) => {
    const next = normalize(clone(value))
    if (new TextEncoder().encode(JSON.stringify(next)).length > MAX_SNAPSHOT_BYTES) throw new Error('Progress is too large to save.')
    return next
  }
  const remoteValue = (remote) => {
    if (remote === null) return null
    if (!remote || !remote.snapshot || typeof remote.snapshot !== 'object' || Array.isArray(remote.snapshot) || !Number.isSafeInteger(remote.revision) || remote.revision < 1 || !UUID.test(remote.writeId)) throw new TypeError('Invalid cloud progress.')
    return { snapshot: clean(remote.snapshot), revision: remote.revision, writeId: remote.writeId }
  }
  // All IDB work runs inside request callbacks. No network or arbitrary awaits can
  // let a read/write transaction become inactive between its read and its write.
  function transaction(names, mode, run) {
    return new Promise((resolve, reject) => {
      let tx, result, failure
      try { tx = db.transaction(names, mode) } catch (error) { reject(error); return }
      const fail = (error) => { failure = error; try { tx.abort() } catch { /* Already aborted. */ } }
      const guard = (fn) => (...args) => { try { fn(...args) } catch (error) { fail(error) } }
      const get = (name, id, then) => {
        const req = id === undefined ? tx.objectStore(name).getAll() : tx.objectStore(name).get(id)
        req.onsuccess = guard(() => then(req.result))
      }
      tx.oncomplete = () => resolve(result)
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Progress was not saved.'))
      tx.onerror = () => { /* Abort handler reports the transaction failure. */ }
      guard(run)({ tx, get, done: (value) => { result = value }, guard })
    })
  }
  function preserve(tx, record, snapshot, reason) {
    tx.objectStore('recovery').put({
      id: crypto.randomUUID(), profileId: record.profileId, gameId, curriculumId,
      snapshot: clone(snapshot), reason, createdAt: new Date().toISOString(),
    })
  }
  function change(profileId, run) {
    return transaction(['records', 'recovery'], 'readwrite', ({ tx, get, done }) => {
      get('records', keyFor(profileId), (record) => run(record ?? null, tx, done))
    })
  }
  const write = (tx, record, done, status = 'saved') => {
    tx.objectStore('records').put(record)
    done({ status, record: clone(record) })
  }
  const requireRecord = (record) => { if (!record) throw new Error('This local profile no longer exists.') }
  function choose(record, tx, remote, choice) {
    if (!['cloud', 'device'].includes(choice)) throw new Error('Choose this device or cloud progress.')
    if (choice === 'cloud') {
      if (!remote) throw new Error('There is no cloud progress to restore.')
      preserve(tx, record, record.snapshot, 'Before restoring cloud progress')
      record.snapshot = remote.snapshot
    } else if (remote) preserve(tx, record, remote.snapshot, 'Cloud progress before keeping this device')
    record.localRevision++
    record.remoteRevision = remote?.revision ?? 0
    record.inflight = null
    record.conflict = null
    record.needsUpload = choice === 'device'
  }
  const api = {
    close: () => db.close(),
    listProfiles: () => transaction(['profiles'], 'readonly', ({ get, done }) => get('profiles', undefined, (rows) => done(rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))))),
    async createProfile(label, initialSnapshot) {
      if (typeof label !== 'string' || !label.trim() || label.trim().length > 60) throw new TypeError('Use a nickname of 1 to 60 characters.')
      const snapshot = clean(initialSnapshot)
      return transaction(['profiles', 'records'], 'readwrite', ({ tx, get, done }) => {
        get('profiles', undefined, (profiles) => {
          if (profiles.length >= MAX_PROFILES) throw new Error('This device has eight profiles. Export and remove one before adding another.')
          const profile = { id: crypto.randomUUID(), label: label.trim(), createdAt: new Date().toISOString() }
          tx.objectStore('profiles').put(profile)
          tx.objectStore('records').put({ key: keyFor(profile.id), profileId: profile.id, gameId, curriculumId, snapshot, localRevision: 1, binding: null, remoteRevision: 0, inflight: null, conflict: null, needsUpload: false })
          done(profile)
        })
      })
    },
    load: (profileId) => transaction(['records'], 'readonly', ({ get, done }) => get('records', keyFor(profileId), (record) => done(record ?? null))),
    save(profileId, snapshot, expectedRevision) {
      const value = clean(snapshot)
      return change(profileId, (record, tx, done) => {
        requireRecord(record)
        if (record.localRevision !== expectedRevision) {
          preserve(tx, record, value, 'Another tab saved first')
          done({ status: 'local-conflict', record })
          return
        }
        record.snapshot = value
        record.localRevision++
        record.needsUpload = !!record.binding
        write(tx, record, done)
      })
    },
    attach(profileId, binding, expectedRevision, remote, choice) {
      const safeBinding = validateBinding(binding)
      const safeRemote = remoteValue(remote)
      return change(profileId, (record, tx, done) => {
        requireRecord(record)
        if (record.localRevision !== expectedRevision) { done({ status: 'local-conflict', record }); return }
        choose(record, tx, safeRemote, choice)
        record.binding = safeBinding
        write(tx, record, done)
      })
    },
    beginFlush(profileId, binding) {
      return change(profileId, (record, tx, done) => {
        if (!record || !sameBinding(record.binding, binding) || record.conflict || (!record.inflight && !record.needsUpload)) { done(null); return }
        if (!record.inflight) record.inflight = {
          writeId: crypto.randomUUID(), localRevision: record.localRevision,
          expectedRemoteRevision: record.remoteRevision, snapshot: clone(record.snapshot),
        }
        tx.objectStore('records').put(record)
        done(clone(record))
      })
    },
    acknowledge(profileId, binding, writeId, remoteRevision) {
      if (!Number.isSafeInteger(remoteRevision) || remoteRevision < 1) throw new TypeError('Invalid saved revision.')
      return change(profileId, (record, tx, done) => {
        if (!record || !sameBinding(record.binding, binding) || record.inflight?.writeId !== writeId) { done({ status: 'stale' }); return }
        if (remoteRevision !== record.inflight.expectedRemoteRevision + 1) throw new Error('Unexpected cloud revision. Progress remains queued.')
        record.remoteRevision = remoteRevision
        record.needsUpload = record.localRevision !== record.inflight.localRevision
        record.inflight = null
        record.conflict = null
        write(tx, record, done)
      })
    },
    markConflict(profileId, binding, writeId, remote) {
      const safeRemote = remoteValue(remote)
      return change(profileId, (record, tx, done) => {
        if (!record || !sameBinding(record.binding, binding) || record.inflight?.writeId !== writeId) { done({ status: 'stale' }); return }
        if (safeRemote && record.conflict?.remote && safeRemote.revision < record.conflict.remote.revision) { done({ status: 'stale' }); return }
        if (JSON.stringify(record.conflict?.remote) === JSON.stringify(safeRemote)) { done({ status: 'cloud-conflict', record }); return }
        record.conflict = { id: crypto.randomUUID(), remote: safeRemote }
        write(tx, record, done, 'cloud-conflict')
      })
    },
    resolveConflict(profileId, binding, expectedRevision, choice, expectedConflictId) {
      return change(profileId, (record, tx, done) => {
        requireRecord(record)
        if (!sameBinding(record.binding, binding) || !record.conflict) { done({ status: 'stale' }); return }
        if (record.localRevision !== expectedRevision) { done({ status: 'local-conflict', record }); return }
        if (!expectedConflictId || record.conflict.id !== expectedConflictId) { done({ status: 'stale', record }); return }
        choose(record, tx, record.conflict.remote, choice)
        write(tx, record, done)
      })
    },
    listRecovery: (profileId) => transaction(['recovery'], 'readonly', ({ tx, done, guard }) => {
      const request = tx.objectStore('recovery').index('profileId').getAll(profileId)
      request.onsuccess = guard(() => done(request.result.filter((row) => row.gameId === gameId && row.curriculumId === curriculumId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))))
    }),
    removeProfile: (profileId) => transaction(['profiles', 'records', 'recovery'], 'readwrite', ({ tx, get, done }) => {
      tx.objectStore('profiles').delete(profileId)
      get('records', undefined, (rows) => { for (const row of rows) if (row.profileId === profileId) tx.objectStore('records').delete(row.key) })
      get('recovery', undefined, (rows) => { for (const row of rows) if (row.profileId === profileId) tx.objectStore('recovery').delete(row.id) })
      done(undefined)
    }),
  }
  return api
}
