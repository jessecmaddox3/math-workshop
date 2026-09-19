// Visible, session-only fallback. Never enable cloud with a non-durable outbox.
export function createMemoryStore(normalize) {
  const profiles = new Map(), records = new Map()
  return {
    close() {},
    async listProfiles() { return [...profiles.values()].map((value) => structuredClone(value)) },
    async createProfile(label, snapshot) {
      if (profiles.size >= 8) throw new Error('There are already eight profiles in this session.')
      if (typeof label !== 'string' || !label.trim() || label.trim().length > 60) throw new Error('Use a nickname of 1 to 60 characters.')
      const value = normalize(snapshot)
      const profile = { id: crypto.randomUUID(), label: label.trim(), createdAt: new Date().toISOString() }
      profiles.set(profile.id, profile)
      records.set(profile.id, { profileId: profile.id, snapshot: value, localRevision: 1, binding: null, needsUpload: false, conflict: null })
      return structuredClone(profile)
    },
    async load(id) { return structuredClone(records.get(id) ?? null) },
    async save(id, snapshot, expectedRevision) {
      const record = records.get(id)
      if (!record) throw new Error('This local profile no longer exists.')
      if (record.localRevision !== expectedRevision) return { status: 'local-conflict', record: structuredClone(record) }
      record.snapshot = normalize(snapshot)
      record.localRevision++
      return { status: 'saved', record: structuredClone(record) }
    },
    async listRecovery() { return [] },
    async removeProfile(id) { profiles.delete(id); records.delete(id) },
  }
}
