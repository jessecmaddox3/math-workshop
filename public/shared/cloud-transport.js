import { CloudError, parseCloudConfig } from './cloud-config.js'
import { validateBinding } from './progress-store.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROFILE_FIELDS = 'owner_id,id,label'
const SAVE_FIELDS = 'owner_id,profile_id,game_id,curriculum_id,format_version,snapshot,revision,write_id'
const stale = () => new CloudError('disconnected', 'Cloud saves are disconnected. Your device progress stays here.')
function safeError(error) {
  if (error instanceof CloudError) return error
  if (error?.code === 'otp_expired') return new CloudError('invalid-code', 'That code is incorrect or expired. Check it or request a new code.')
  if (Number(error?.status) === 429) return new CloudError('rate-limit', 'Too many sign-in attempts. Wait a little before trying again.')
  if ([401, 403].includes(Number(error?.status))) return new CloudError('auth-required', 'Sign in again to finish saving. Your device progress is safe.')
  return new CloudError('unavailable', 'Cloud saves are unavailable. Your device progress is still saved here; try again later.')
}

/** Call only after explicit adult opt-in and parseCloudConfig. Never at page startup. */
export function createCloudConnection(config, {
  gameId, curriculumId, normalize,
  loadSDK = () => import('../vendor/supabase.js'),
  nativeFetch = globalThis.fetch.bind(globalThis),
  onStatus = () => {},
} = {}) {
  config = parseCloudConfig({ enabled: true, url: config?.backend, publishableKey: config?.publishableKey, label: config?.label })
  let active = true, client = null, subscription = null, ownerId = null, email = null
  let loginBusy = false, resendAfter = 0, authLost = false
  const lifetime = new AbortController()
  const assertActive = () => { if (!active) throw stale() }
  const publishStatus = (status) => { if (active) { try { onStatus(status) } catch { /* UI listeners cannot interrupt auth. */ } } }
  const dispose = () => {
    subscription?.unsubscribe()
    client?.auth.dispose()
    // No Realtime socket is opened here. Disconnecting an unopened SDK socket
    // creates an unnecessary timer; Auth is this adapter's only live service.
  }
  const disconnect = () => {
    if (!active) return
    active = false
    lifetime.abort()
    ownerId = null
    email = null
    dispose()
  }
  const guardedFetch = async (input, init = {}) => {
    assertActive()
    const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    if (target.origin !== config.backend || !/^\/(auth|rest)\/v1\//.test(target.pathname)) {
      throw new CloudError('configuration', 'Cloud request destination was rejected.')
    }
    const signals = [lifetime.signal, init.signal, typeof input === 'object' ? input.signal : null].filter(Boolean)
    const response = await nativeFetch(input, { ...init, signal: AbortSignal.any(signals), credentials: 'omit', redirect: 'error' })
    assertActive()
    return response
  }
  const ready = (async () => {
    try {
      const { createClient } = await loadSDK()
      assertActive()
      client = createClient(config.backend, config.publishableKey, {
        auth: { persistSession: false, detectSessionInUrl: false, autoRefreshToken: false, debug: false, storageKey: `learning-cloud-${crypto.randomUUID()}` },
        db: { retry: false }, global: { fetch: guardedFetch },
      })
      const result = await client.auth.initialize()
      assertActive()
      if (result.error) throw result.error
      await client.auth.stopAutoRefresh()
      assertActive()
      subscription = client.auth.onAuthStateChange((_event, session) => {
        if (!active || !ownerId) return
        if (session && session.user.id !== ownerId) { disconnect(); return }
        if (!session) { authLost = true; publishStatus('auth-required') }
      }).data.subscription
    } catch (error) {
      if (!active) { dispose(); throw stale() }
      disconnect()
      throw safeError(error)
    }
  })()
  // A cancelled lazy import may finish after the UI has closed. It must be handled.
  ready.catch(() => {})
  async function call(operation, requiresOwner = true) {
    try {
      await ready
      assertActive()
      if (requiresOwner && (!ownerId || authLost)) throw new CloudError('auth-required', 'Sign in to use cloud saves.')
      const result = await operation(client)
      assertActive()
      if (result?.error) throw result.error
      return result?.data
    } catch (error) { if (!active) throw stale(); throw safeError(error) }
  }
  const owned = (binding) => {
    const value = validateBinding(binding)
    assertActive()
    if (value.backend !== config.backend || value.ownerId !== ownerId || authLost) throw new CloudError('auth-required', 'Sign in to the original account and cloud destination for this profile.')
    return value
  }
  const profileValue = (row) => {
    if (!row || row.owner_id !== ownerId || !UUID.test(row.id) || typeof row.label !== 'string' || !row.label.trim() || row.label.length > 60) throw new CloudError('invalid', 'The cloud returned an invalid learner profile.')
    return { id: row.id, label: row.label }
  }
  const cleanSnapshot = (snapshot) => {
    let clean
    try { clean = normalize(structuredClone(snapshot)) } catch { throw new CloudError('invalid', 'This cloud progress needs a different app version or a recovery export.') }
    if (new TextEncoder().encode(JSON.stringify(clean)).length > 1048576) throw new CloudError('invalid', 'Cloud progress is too large to load safely.')
    return clean
  }
  function remoteValue(row, binding) {
    if (row === null) return null
    if (!row || !row.snapshot || typeof row.snapshot !== 'object' || Array.isArray(row.snapshot) || !Number.isInteger(row.format_version) || row.owner_id !== binding.ownerId || row.profile_id !== binding.profileId || row.game_id !== gameId || row.curriculum_id !== curriculumId || !Number.isSafeInteger(row.revision) || row.revision < 1 || !UUID.test(row.write_id) || row.format_version !== row.snapshot.formatVersion) throw new CloudError('invalid', 'The cloud returned an unexpected learning record.')
    return { snapshot: cleanSnapshot(row.snapshot), revision: row.revision, writeId: row.write_id }
  }
  const filtered = (query, binding) => query.eq('owner_id', binding.ownerId).eq('profile_id', binding.profileId).eq('game_id', gameId).eq('curriculum_id', curriculumId)
  async function read(binding) {
    owned(binding)
    const data = await call((sdk) => filtered(sdk.from('learning_saves').select(SAVE_FIELDS), binding).maybeSingle())
    owned(binding)
    return remoteValue(data, binding)
  }
  function reconcile(remote, inflight) {
    if (remote?.writeId === inflight.writeId) {
      if (remote.revision !== inflight.expectedRemoteRevision + 1 || JSON.stringify(remote.snapshot) !== JSON.stringify(inflight.snapshot)) throw new CloudError('invalid', 'The cloud acknowledgement does not match this saved attempt.')
      return { status: 'saved', remote }
    }
    if ((remote?.revision ?? 0) !== inflight.expectedRemoteRevision) return { status: 'conflict', remote }
    return null
  }
  return {
    ready, disconnect,
    get active() { return active },
    get ownerId() { return ownerId },
    get backend() { return config.backend },
    owns: (binding) => active && !authLost && !!ownerId && binding?.backend === config.backend && binding.ownerId === ownerId,
    async sendCode(address) {
      if (loginBusy) throw new CloudError('busy', 'Please wait for the current sign-in request.')
      if (typeof address !== 'string' || address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.trim())) throw new CloudError('invalid', 'Enter an adult email address.')
      const next = address.trim()
      if (email && email !== next) throw new CloudError('new-connection', 'Cancel this sign-in before changing the email address.')
      if (ownerId) throw new CloudError('new-connection', 'Disconnect before signing in to another account.')
      if (Date.now() < resendAfter) throw new CloudError('cooldown', 'Wait one minute before requesting another code.')
      loginBusy = true
      email = next
      try {
        await call((sdk) => sdk.auth.signInWithOtp({ email: next, options: { shouldCreateUser: true } }), false)
        resendAfter = Date.now() + 60000
      } finally { loginBusy = false }
    },
    async verifyCode(code) {
      if (loginBusy) throw new CloudError('busy', 'Please wait for the current sign-in request.')
      if (!email || !/^\d{6,10}$/.test(code)) throw new CloudError('invalid', 'Enter the code from your email.')
      loginBusy = true
      const sentTo = email
      try {
        const data = await call((sdk) => sdk.auth.verifyOtp({ email: sentTo, token: code, type: 'email' }), false)
        if (!data?.session || !UUID.test(data.user?.id) || data.session.user?.id !== data.user.id) throw new CloudError('invalid', 'Sign-in did not return a valid account.')
        ownerId = data.user.id
        authLost = false
        email = null
        return ownerId
      } finally { loginBusy = false }
    },
    async listProfiles() {
      const data = await call((sdk) => sdk.from('learning_profiles').select(PROFILE_FIELDS).eq('owner_id', ownerId).order('created_at'))
      if (!Array.isArray(data)) throw new CloudError('invalid', 'The cloud returned an invalid learner list.')
      return data.map(profileValue)
    },
    async createProfile(label) {
      if (typeof label !== 'string' || !label.trim() || label.trim().length > 60) throw new CloudError('invalid', 'Use a nickname of 1 to 60 characters.')
      const data = await call((sdk) => sdk.from('learning_profiles').insert({ owner_id: ownerId, label: label.trim() }).select(PROFILE_FIELDS).single())
      return profileValue(data)
    },
    read,
    async write(binding, inflight) {
      owned(binding)
      if (!inflight || !UUID.test(inflight.writeId) || !Number.isSafeInteger(inflight.expectedRemoteRevision) || inflight.expectedRemoteRevision < 0) throw new CloudError('invalid', 'Invalid pending cloud save.')
      const snapshot = cleanSnapshot(inflight.snapshot)
      const attempt = { ...inflight, snapshot }
      const existing = await read(binding)
      const recovered = reconcile(existing, attempt)
      if (recovered) return recovered
      const payload = { snapshot, format_version: snapshot.formatVersion, write_id: attempt.writeId }
      // Catch duplicate INSERT locally so it can be reconciled without turning it
      // into an unconditional overwrite. All other errors leave the outbox intact.
      const outcome = await call(async (sdk) => {
        const result = attempt.expectedRemoteRevision === 0
          ? await sdk.from('learning_saves').insert({ ...payload, owner_id: binding.ownerId, profile_id: binding.profileId, game_id: gameId, curriculum_id: curriculumId }).select(SAVE_FIELDS)
          : await filtered(sdk.from('learning_saves').update(payload), binding).eq('revision', attempt.expectedRemoteRevision).select(SAVE_FIELDS)
        if (result.error?.code === '23505') return { data: [] }
        return result
      })
      owned(binding)
      if (!Array.isArray(outcome) || outcome.length > 1) throw new CloudError('invalid', 'The cloud returned an unexpected save response.')
      const remote = outcome.length === 1 ? remoteValue(outcome[0], binding) : await read(binding)
      const result = reconcile(remote, attempt)
      if (result) return result
      // A zero-row response with the same revision is still not an acknowledgement.
      throw new CloudError('unavailable', 'This save was not acknowledged. It stays queued on this device.')
    },
  }
}

export async function flushOne(store, profileId, connection) {
  const record = await store.load(profileId)
  if (!record || !connection.owns(record.binding)) return { status: 'disconnected' }
  const pending = await store.beginFlush(profileId, record.binding)
  if (!pending) return { status: record.conflict ? 'cloud-conflict' : 'idle' }
  if (!connection.owns(pending.binding)) return { status: 'disconnected' }
  const result = await connection.write(pending.binding, pending.inflight)
  if (!connection.owns(pending.binding)) return { status: 'disconnected' }
  if (result.status === 'saved') return store.acknowledge(profileId, pending.binding, pending.inflight.writeId, result.remote.revision)
  return store.markConflict(profileId, pending.binding, pending.inflight.writeId, result.remote)
}
