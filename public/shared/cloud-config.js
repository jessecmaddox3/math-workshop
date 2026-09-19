export class CloudError extends Error {
  constructor(code, message) { super(message); this.name = 'CloudError'; this.code = code }
}

export function parseCloudConfig(raw) {
  if (!raw || raw.enabled !== true) return null
  let url
  try { url = new URL(raw.url) } catch { throw new CloudError('configuration', 'Cloud saves need a valid HTTPS address in the host configuration.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new CloudError('configuration', 'Cloud saves need an HTTPS origin without a path, password or query.')
  }
  if (typeof raw.publishableKey !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(raw.publishableKey)) {
    throw new CloudError('configuration', 'Cloud saves need a Supabase publishable key. Secret keys and legacy keys are not accepted.')
  }
  const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim().slice(0, 60) : 'This host’s cloud saves'
  return Object.freeze({ backend: url.origin, publishableKey: raw.publishableKey, label })
}
