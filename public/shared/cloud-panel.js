import { parseCloudConfig } from './cloud-config.js'
import { createCloudConnection, flushOne } from './cloud-transport.js'

export function createCloudPanel(root, options) {
  const { store, durable, normalize, curriculumId, gameId, configURL, helpURL, getProfile, isBusy, onChange, onMutation, onRestore, onRemoval, onMessage, describe } = options
  let config = null, connection = null, generation = 0, view = 0, timer = null, failures = 0, running = null
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.className = 'cloud-status'
  const content = document.createElement('div')
  root.append(content, status)
  const say = (text) => { status.textContent = text }
  const paragraph = (text) => { const p = document.createElement('p'); p.textContent = text; content.append(p); return p }
  function button(label, action, parent = content) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label
    button.addEventListener('click', async () => {
      if (button.disabled) return
      button.disabled = true
      try { await action() }
      catch (error) { if (error.code !== 'disconnected') say(error.message || 'That action could not be completed. Your progress is still here.') }
      finally { button.disabled = false }
    })
    parent.append(button); return button
  }
  function retire() {
    generation++; view++; clearTimeout(timer); timer = null; failures = 0; running = null
    connection?.disconnect(); connection = null
  }
  const alive = (original, token) => connection === original && generation === token && original.active
  function localActionsAllowed() {
    if (isBusy()) { say('Finish the current answer or export unsaved progress before changing cloud profiles.'); return false }
    return true
  }
  async function flush() {
    const selected = getProfile(), original = connection, token = generation
    if (!selected || !original?.ownerId) return
    if (running?.token === token) { running.again = true; return }
    const work = { token }; running = work
    try {
      for (let i = 0; i < 8 && alive(original, token); i++) {
        const result = await flushOne(store, selected.id, original)
        if (!alive(original, token)) return
        if (result.status !== 'saved') break
      }
      if (!alive(original, token)) return
      failures = 0
      await onChange()
      const record = await store.load(selected.id)
      if (!alive(original, token)) return
      if (record?.conflict) say('Another device changed this learner. Choose which progress to keep below.')
      else if (record && original.owns(record.binding) && !record.needsUpload) say('Cloud saved. Your copy also stays on this device.')
      if (root.closest('dialog')?.open) await renderConnected()
      if (record?.needsUpload && !record.conflict && original.owns(record.binding)) queue(1000)
    } catch (error) {
      if (!alive(original, token)) return
      say(error.message)
      await onChange()
      if (error.code === 'unavailable' && failures < 5) {
        failures++
        queue(Math.min(60000, 2000 * 2 ** failures) + Math.floor(Math.random() * 500))
      }
    } finally {
      if (running === work) {
        running = null
        if (work.again && alive(original, token)) queue()
      }
    }
  }
  function queue(delay = 0) {
    if (!connection?.ownerId) return
    clearTimeout(timer)
    timer = setTimeout(() => { timer = null; void flush() }, delay)
  }
  function initial() {
    content.replaceChildren()
    paragraph('Cloud saves are optional. Play and save on this device without an account.')
    if (!durable) { paragraph('Cloud saves need working browser storage. This session can be exported instead.'); return }
    if (location.protocol === 'file:') {
      paragraph('This downloaded copy works offline. To save across devices, use a hosted copy whose owner has set up cloud saves. You can also move progress with Export and Import.')
      return
    }
    button('Explore cloud saves', async () => {
      const token = ++view
      say('Checking this host’s cloud configuration…')
      try {
        const response = await fetch(configURL, { credentials: 'omit', redirect: 'error', cache: 'no-store' })
        if (token !== view) return
        if (!response.ok) { say('This host has not enabled cloud saves. Device saves and exports still work.'); return }
        const text = await response.text()
        if (text.length > 16384) throw new Error('This host’s cloud configuration is too large.')
        config = parseCloudConfig(JSON.parse(text))
        if (token !== view) return
        if (!config) { say('This host has not enabled cloud saves. Device saves and exports still work.'); return }
        renderLogin()
      } catch (error) { say(error.code === 'configuration' ? error.message : 'This host’s cloud configuration could not be loaded. Device saves still work.') }
    })
    const help = document.createElement('a'); help.href = helpURL; help.textContent = 'Cloud setup instructions for the host'; content.append(help)
  }
  function renderLogin() {
    content.replaceChildren(); view++
    paragraph(`${config.label}: ${config.backend}`)
    paragraph('An adult can sign in by email code. Continuing creates an account if needed. Only learner nicknames and learning progress you choose are uploaded. Your email goes to this cloud provider for sign-in.')
    const form = document.createElement('form'); form.className = 'settings-form'
    const label = document.createElement('label'); label.textContent = 'Adult email'; label.htmlFor = 'cloud-email'
    const input = document.createElement('input'); input.id = 'cloud-email'; input.type = 'email'; input.required = true; input.maxLength = 254; input.autocomplete = 'email'
    const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Email me a code'
    form.append(label, input, submit); content.append(form)
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); if (submit.disabled) return; submit.disabled = true
      retire()
      const token = generation
      const original = createCloudConnection(config, { gameId, curriculumId, normalize, onStatus: (value) => { if (value === 'auth-required') say('Sign in again to finish saving.') } })
      connection = original
      const address = input.value.trim()
      try {
        await original.sendCode(address)
        if (alive(original, token)) renderCode(original, token, address)
      } catch (error) { if (alive(original, token)) say(error.message) }
      finally { submit.disabled = false }
    })
    button('Cancel cloud sign-in', () => { retire(); config = null; initial(); say('Cloud sign-in cancelled. Local progress stays on this device.') })
    say('No cloud account is needed to play locally.')
  }
  function renderCode(original, token, address) {
    content.replaceChildren(); view++
    paragraph('Check the adult email inbox for a sign-in code. Leave this page open while you check.')
    const form = document.createElement('form'); form.className = 'settings-form'
    const label = document.createElement('label'); label.textContent = 'Email code'; label.htmlFor = 'cloud-code'
    const input = document.createElement('input'); input.id = 'cloud-code'; input.required = true; input.inputMode = 'numeric'; input.autocomplete = 'one-time-code'; input.pattern = '[0-9]{6,10}'; input.maxLength = 10
    const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Sign in'
    form.append(label, input, submit); content.append(form)
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); if (submit.disabled || !alive(original, token)) return; submit.disabled = true
      try { await original.verifyCode(input.value.trim()); if (alive(original, token)) { input.value = ''; await renderConnected(); queue() } }
      catch (error) { if (alive(original, token)) say(error.message) }
      finally { submit.disabled = false }
    })
    button('Send a new code', async () => { await original.sendCode(address); if (alive(original, token)) say('A new code was requested. Check your email.') })
    button('Cancel or change email', () => { retire(); renderLogin() })
    say('Codes may take a moment to arrive. You can request another after one minute.')
    input.focus()
  }
  async function renderConnected() {
    if (!connection?.ownerId) return
    const original = connection, token = generation, rendering = ++view
    content.replaceChildren()
    paragraph(`Connected to ${config.label} (${config.backend}).`)
    paragraph('Disconnect ends this browser connection. Downloaded progress stays on this device until you remove it. Sign in again when you want to resume cloud saving.')
    button('Disconnect cloud saves', () => { retire(); initial(); say('Disconnected. Downloaded progress and waiting saves remain on this device.') })
    button('Retry cloud saving', async () => { failures = 0; queue() })
    button('Remove this account’s downloaded learners', async () => {
      if (!localActionsAllowed() || !confirm('Remove this account’s downloaded learners and recovery copies from this device? Cloud copies will remain. Export any backups first.')) return
      await onRemoval(async () => {
        const profiles = await store.listProfiles()
        for (const profile of profiles) {
          const record = await store.load(profile.id)
          if (!alive(original, token)) return
          if (original.owns(record?.binding)) await store.removeProfile(profile.id)
        }
      })
      if (!alive(original, token)) return
      await renderConnected(); say('Downloaded learners for this account were removed from this device. Cloud copies remain.')
    })
    const selected = getProfile()
    if (selected) {
      const local = await store.load(selected.id)
      if (!alive(original, token) || rendering !== view) return
      paragraph(`Current local learner: ${selected.label}. ${describe(local.snapshot)}.`)
      if (local.conflict && original.owns(local.binding)) {
        const remote = local.conflict.remote
        paragraph(remote ? `Another device saved: ${describe(remote.snapshot)}. No versions have been merged.` : 'The cloud copy is missing. Your device copy remains available.')
        for (const choice of remote ? ['device', 'cloud'] : ['device']) {
          button(choice === 'device' ? 'Keep this device’s progress' : 'Use the cloud progress shown above', async () => {
            if (!localActionsAllowed()) return
            const result = await onMutation(() => store.resolveConflict(selected.id, local.binding, local.localRevision, choice, local.conflict.id))
            if (!alive(original, token)) return
            await renderConnected()
            if (result.status === 'saved') { say('Your choice was saved. A recovery copy keeps the other version.'); queue() }
            else say('Progress changed while this choice was open. Review the latest versions before choosing again.')
          })
        }
      }
      button(`Save ${selected.label} as a new cloud learner`, async () => {
        if (!localActionsAllowed()) return
        const current = await store.load(selected.id)
        if (!alive(original, token)) return
        const remoteProfile = await original.createProfile(selected.label)
        if (!alive(original, token)) return
        const result = await onMutation(() => store.attach(selected.id, { backend: config.backend, ownerId: original.ownerId, profileId: remoteProfile.id }, current.localRevision, null, 'device'))
        if (!alive(original, token)) return
        await renderConnected()
        if (result.status === 'saved') queue()
        else say('The local learner changed during setup. Select the new cloud learner below to review and attach it.')
      })
    }
    try {
      const profiles = await original.listProfiles()
      if (!alive(original, token) || rendering !== view) return
      paragraph(profiles.length ? 'Choose an existing cloud learner to preview or restore. Matching nicknames do not merge learners.' : 'This account has no cloud learners yet. Choose a local learner, then save it to cloud.')
      for (const remoteProfile of profiles) button(`Preview ${remoteProfile.label}`, () => preview(original, token, remoteProfile))
    } catch (error) { if (alive(original, token)) say(error.message) }
  }
  async function preview(original, token, remoteProfile) {
    const rendering = ++view
    const binding = { backend: config.backend, ownerId: original.ownerId, profileId: remoteProfile.id }
    const remote = await original.read(binding)
    if (!alive(original, token) || rendering !== view) return
    content.replaceChildren(); paragraph(`Cloud learner: ${remoteProfile.label}.`)
    paragraph(remote ? `${describe(remote.snapshot)}. Local progress is replaced only if you choose that below.` : 'This cloud learner has no saved progress yet.')
    if (remote) button('Restore as a new local learner', async () => {
      if (!localActionsAllowed()) return
      const learner = await store.createProfile(remoteProfile.label, remote.snapshot)
      if (!alive(original, token)) { await store.removeProfile(learner.id); return }
      await store.attach(learner.id, binding, 1, remote, 'cloud')
      if (!alive(original, token)) return
      await onRestore(learner); say('Cloud progress restored. A copy now lives on this device too.')
    })
    const selected = getProfile()
    if (selected) {
      const local = await store.load(selected.id)
      if (!alive(original, token) || rendering !== view) return
      paragraph(`Local learner: ${selected.label}. ${describe(local.snapshot)}.`)
      for (const choice of remote ? ['cloud', 'device'] : ['device']) {
        button(choice === 'cloud' ? `Use cloud progress for ${selected.label}` : `Use ${selected.label}’s progress for this cloud learner`, async () => {
          if (!localActionsAllowed()) return
          const result = await onMutation(() => store.attach(selected.id, binding, local.localRevision, remote, choice))
          if (!alive(original, token)) return
          await renderConnected()
          if (result.status === 'saved') { say('Your choice was saved. The other version is available in a recovery export.'); queue() }
          else say('The local learner changed. Preview again before choosing a version.')
        })
      }
    }
    button('Back to cloud learners', renderConnected)
    button('Disconnect cloud saves', () => { retire(); initial(); say('Disconnected. Local copies remain on this device.') })
  }
  initial()
  window.addEventListener('online', () => { failures = 0; queue() })
  return { queue, renderConnected, disconnect: () => { retire(); initial(); } }
}
