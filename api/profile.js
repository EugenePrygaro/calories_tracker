/**
 * Профіль із денними цілями.
 * GET /api/profile              → { profile }
 * PUT /api/profile { profile }  → { applied, profile }  (перемагає більший updatedAt)
 */
import { handler, readJson, send } from '../server/http.js'
import { KEYS, parseStored, redis } from '../server/store.js'
import { DEFAULT_PROFILE, sanitizeProfile } from '../shared/validate.js'

/** @param {unknown} value */
function storedProfile(value) {
  try {
    return sanitizeProfile(parseStored(value))
  } catch {
    return DEFAULT_PROFILE
  }
}

export default handler(['GET', 'PUT'], async (req, res) => {
  const r = redis()
  const current = storedProfile(await r.get(KEYS.profile))

  if (req.method === 'GET') return send(res, 200, { profile: current })

  const profile = sanitizeProfile(readJson(req).profile)
  if (current.updatedAt > profile.updatedAt) {
    return send(res, 200, { applied: false, profile: current })
  }
  await r.set(KEYS.profile, profile)
  send(res, 200, { applied: true, profile })
})
