import { isCoordinate } from '@/utils/geo'

/**
 * The only place the application talks to Mapbox's web services (BR E.2).
 *
 *   Geocoding v6   — a typed address or suburb → coordinates, and back again
 *                    for "use my location" so the trip says where it starts.
 *   Directions v5  — a route between two points for walking, cycling and
 *                    driving, with turn-by-turn steps, distance and duration.
 *
 * The map tiles themselves are drawn by mapbox-gl in SiteMap.vue, using the
 * same token.
 *
 * The token is a *public* token (pk.…). It is meant to be shipped to browsers —
 * Mapbox has no other way to authorise a map in a static site — so it is not a
 * secret in the way a Firebase admin key would be. What protects it is the URL
 * restriction set on the token in the Mapbox account, which limits it to this
 * site's domains. It is kept in .env.local only so a clone uses its own.
 */
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? ''

export const isMapConfigured = () => MAPBOX_TOKEN.startsWith('pk.')

const API = 'https://api.mapbox.com'

/**
 * Keeps searches to greater Melbourne. Without it "Sunshine" is as likely to
 * resolve to the Sunshine Coast, 1,700 km away, as to the suburb in Brimbank.
 */
const MELBOURNE_BBOX = '144.40,-38.40,145.60,-37.40'
const MELBOURNE_CENTRE = { lng: 144.85, lat: -37.79 }

/** The three ways of getting there that Mapbox can route. */
export const TRAVEL_MODES = [
  { id: 'walking', label: 'Walk', profile: 'mapbox/walking' },
  { id: 'cycling', label: 'Cycle', profile: 'mapbox/cycling' },
  { id: 'driving', label: 'Drive', profile: 'mapbox/driving-traffic' }
]

/**
 * A failure a person can act on. `code` lets the caller decide whether it is
 * worth offering a retry.
 */
export class MapServiceError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'MapServiceError'
    this.code = code
  }
}

async function request(path, params, { signal } = {}) {
  if (!isMapConfigured()) {
    throw new MapServiceError('Maps are not set up on this site yet.', 'not-configured')
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new MapServiceError('You appear to be offline. Check your connection and try again.', 'offline')
  }

  const url = new URL(path, API)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value)
  }
  url.searchParams.set('access_token', MAPBOX_TOKEN)

  let response
  try {
    response = await fetch(url, { signal })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new MapServiceError('Could not reach the map service. Try again in a moment.', 'network')
  }

  if (response.status === 401 || response.status === 403) {
    throw new MapServiceError('The map service refused this site’s access token.', 'unauthorised')
  }
  if (response.status === 429) {
    throw new MapServiceError('The map service is busy. Wait a few seconds and try again.', 'rate-limited')
  }
  if (!response.ok) {
    throw new MapServiceError('The map service could not answer that request.', 'http')
  }
  return response.json()
}

/** Reduces a Geocoding v6 feature to what the application uses. */
function toPlace(feature) {
  const [lng, lat] = feature.geometry?.coordinates ?? []
  const props = feature.properties ?? {}
  return {
    id: props.mapbox_id ?? `${lng},${lat}`,
    name: props.name ?? props.full_address ?? 'Unnamed place',
    detail: props.place_formatted ?? '',
    label: props.full_address ?? [props.name, props.place_formatted].filter(Boolean).join(', '),
    lng,
    lat
  }
}

/**
 * Address and suburb suggestions as the user types.
 *
 * `near` biases results towards the user (or the map's centre) so the closest
 * "Ballarat Rd" comes first. `signal` lets the caller abandon a request the
 * user has already typed past, so a slow earlier answer cannot overwrite a
 * newer one.
 */
export async function searchPlaces(query, { near = MELBOURNE_CENTRE, signal } = {}) {
  const q = String(query ?? '').trim()
  if (q.length < 3) return []
  const data = await request(
    '/search/geocode/v6/forward',
    {
      q: q.slice(0, 256),
      country: 'au',
      bbox: MELBOURNE_BBOX,
      proximity: isCoordinate(near) ? `${near.lng},${near.lat}` : undefined,
      types: 'address,street,neighborhood,locality,place,postcode',
      autocomplete: 'true',
      language: 'en',
      limit: 5
    },
    { signal }
  )
  return (data.features ?? []).map(toPlace).filter(isCoordinate)
}

/** The nearest street address to a point — names the "my location" origin. */
export async function describeLocation(point, { signal } = {}) {
  if (!isCoordinate(point)) return null
  const data = await request(
    '/search/geocode/v6/reverse',
    { longitude: point.lng, latitude: point.lat, types: 'address,street,locality', limit: 1, language: 'en' },
    { signal }
  )
  const feature = data.features?.[0]
  return feature ? toPlace(feature).label : null
}

/**
 * A route from one point to another for one travel mode.
 *
 * Returns null when Mapbox finds no route for that mode (a site across water
 * from the start, say) — an ordinary outcome, not an error.
 */
export async function getRoute(modeId, from, to, { signal } = {}) {
  const mode = TRAVEL_MODES.find((m) => m.id === modeId)
  if (!mode) throw new MapServiceError(`Unknown travel mode: ${modeId}`, 'bad-mode')
  if (!isCoordinate(from) || !isCoordinate(to)) {
    throw new MapServiceError('A start and a destination are both needed.', 'bad-input')
  }

  const coordinates = `${from.lng},${from.lat};${to.lng},${to.lat}`
  let data
  try {
    data = await request(
      `/directions/v5/${mode.profile}/${coordinates}`,
      { geometries: 'geojson', overview: 'full', steps: 'true', language: 'en', alternatives: 'false' },
      { signal }
    )
  } catch (err) {
    // Directions answers "no route" with a 4xx and a code in the body; that is
    // reported as a missing route rather than a failure of the service.
    if (err.code === 'http') return null
    throw err
  }

  const route = data.routes?.[0]
  if (data.code !== 'Ok' || !route) return null

  return {
    mode: mode.id,
    distanceKm: route.distance / 1000,
    durationSeconds: route.duration,
    geometry: route.geometry,
    steps: (route.legs?.[0]?.steps ?? []).map((step) => ({
      instruction: step.maneuver?.instruction ?? '',
      distanceKm: step.distance / 1000,
      durationSeconds: step.duration
    }))
  }
}

/**
 * Every mode at once, so the trip panel can compare them side by side.
 * A mode that fails on its own is reported as unavailable; the others stand.
 */
export async function getRoutes(from, to, { signal } = {}) {
  const results = await Promise.allSettled(
    TRAVEL_MODES.map((mode) => getRoute(mode.id, from, to, { signal }))
  )
  const aborted = results.find((r) => r.status === 'rejected' && r.reason?.name === 'AbortError')
  if (aborted) throw aborted.reason

  const failures = results.filter((r) => r.status === 'rejected')
  if (failures.length === results.length) throw failures[0].reason

  return Object.fromEntries(
    TRAVEL_MODES.map((mode, i) => [mode.id, results[i].status === 'fulfilled' ? results[i].value : null])
  )
}

/**
 * Public transport is not something Mapbox routes. Rather than leave car-free
 * volunteers without an answer, the trip panel hands that one leg to Google
 * Maps, which does. Only coordinates go into the link — no names or addresses.
 */
export function transitDirectionsUrl(from, to) {
  if (!isCoordinate(to)) return null
  const params = new URLSearchParams({
    api: '1',
    destination: `${to.lat},${to.lng}`,
    travelmode: 'transit'
  })
  if (isCoordinate(from)) params.set('origin', `${from.lat},${from.lng}`)
  return `https://www.google.com/maps/dir/?${params}`
}
