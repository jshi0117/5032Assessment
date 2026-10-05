/**
 * Geographic helpers (BR E.2). Pure functions only — no Vue, no I/O.
 *
 * Coordinates are `{ lng, lat }` in decimal degrees (WGS 84), the order Mapbox
 * uses everywhere. Mixing the two orders up is the classic mapping bug — it
 * puts Melbourne in Antarctica — so nothing here takes a bare array.
 */

const EARTH_RADIUS_KM = 6371.0088

const toRadians = (degrees) => (degrees * Math.PI) / 180

/**
 * Great-circle distance in kilometres (haversine formula).
 *
 * Straight-line, not travel, distance: it is what the site list is sorted and
 * filtered by, because it costs nothing to compute for every site. Travel
 * distance comes from the Directions API, once, for the site actually chosen.
 */
export function distanceKm(from, to) {
  if (!from || !to) return null
  const dLat = toRadians(to.lat - from.lat)
  const dLng = toRadians(to.lng - from.lng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

/** "850 m" under a kilometre, "3.4 km" up to 10, "12 km" beyond. */
export function formatDistance(km) {
  if (km === null || km === undefined) return ''
  if (km < 1) return `${Math.round(km * 100) * 10} m`
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`
}

/** "45 sec", "12 min", "1 hr 5 min" from seconds. */
export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return ''
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`
}

/**
 * The south-west and north-east corners enclosing every point, padded so a
 * marker on the edge is not cut in half. Returns null for no points.
 */
export function boundsOf(points, padDegrees = 0.005) {
  const valid = points.filter(Boolean)
  if (!valid.length) return null
  const lngs = valid.map((p) => p.lng)
  const lats = valid.map((p) => p.lat)
  return [
    [Math.min(...lngs) - padDegrees, Math.min(...lats) - padDegrees],
    [Math.max(...lngs) + padDegrees, Math.max(...lats) + padDegrees]
  ]
}

/** True when a value is a usable coordinate pair. */
export const isCoordinate = (point) =>
  Boolean(point) &&
  Number.isFinite(point.lng) && Number.isFinite(point.lat) &&
  Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180

/**
 * The time to set off to arrive `bufferMinutes` before an event starts.
 *
 * `date` and `startTime` are Melbourne wall-clock values ("2026-09-12",
 * "09:00"); the result is returned in the same terms ("08:41"), so no time
 * zone conversion is involved at all. Returns null if the start is unknown.
 */
export function leaveBy(startTime, travelSeconds, bufferMinutes = 10) {
  if (!startTime || travelSeconds === null || travelSeconds === undefined) return null
  const [hours, minutes] = startTime.split(':').map(Number)
  const leave = hours * 60 + minutes - Math.ceil(travelSeconds / 60) - bufferMinutes
  if (leave < 0) return null
  return `${String(Math.floor(leave / 60)).padStart(2, '0')}:${String(leave % 60).padStart(2, '0')}`
}
