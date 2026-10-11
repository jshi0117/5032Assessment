import { FUNCTIONS_REGION } from './firebase'

/**
 * The public REST API (BR F.1 — API access), as the developer page uses it.
 * The API itself is the `api` Cloud Function — see functions/src/api/.
 */
export const API_BASE =
  `https://${FUNCTIONS_REGION}-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net/api/v1`

/**
 * Calls the API and returns everything the "Try it" panel shows: status,
 * the headers worth explaining, the parsed body and how long it took.
 */
export async function tryRequest(url) {
  const started = performance.now()
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  const text = await response.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  const pick = ['content-type', 'cache-control', 'etag', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after']
  return {
    status: response.status,
    ok: response.ok,
    ms: Math.round(performance.now() - started),
    headers: Object.fromEntries(pick.map((h) => [h, response.headers.get(h)]).filter(([, v]) => v)),
    body
  }
}
