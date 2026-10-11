import { createHash } from 'node:crypto'

import { listPublicEvents, listSites } from '../lib/events.js'
import { openApiSpec } from './openapi.js'

/**
 * GreenRoots public API, version 1 (BR F.1 — API access).
 *
 * Read-only access to published planting days and sites, so a council
 * dashboard, a community newsletter or a volunteer's calendar app can use the
 * same data the website shows.
 *
 * Written as a pure function of the request — no Express, no Firebase — so the
 * routing, validation and paging are unit-tested directly (test/api.test.js).
 * The Cloud Function in index.js is a thin adapter around it.
 *
 * Conventions:
 *   - JSON only; every success is `{ data, meta?, links? }`, every failure
 *     `{ error: { status, code, message } }` with the matching HTTP status.
 *   - Versioned in the path (/v1/…), so a breaking change can ship as /v2
 *     without breaking anyone using /v1.
 *   - Only public fields: drafts, coordinator ids and anything about
 *     individual volunteers never leave the server.
 */

export const API_VERSION = 'v1'
const MAX_LIMIT = 100
const DEFAULT_LIMIT = 20
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

const bad = (message) => new ApiError(400, 'invalid_parameter', message)

/* ------------------------------------------------------------ parameters */

function intParam(query, name, { min, max, fallback }) {
  const raw = query[name]
  if (raw === undefined || raw === '') return fallback
  if (!/^\d+$/.test(String(raw))) throw bad(`"${name}" must be a whole number.`)
  const value = Number(raw)
  if (value < min || value > max) throw bad(`"${name}" must be between ${min} and ${max}.`)
  return value
}

function dateParam(query, name) {
  const raw = query[name]
  if (raw === undefined || raw === '') return null
  if (!ISO_DATE.test(String(raw)) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
    throw bad(`"${name}" must be a date in YYYY-MM-DD form.`)
  }
  return String(raw)
}

function boolParam(query, name) {
  const raw = query[name]
  if (raw === undefined || raw === '') return null
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw bad(`"${name}" must be true or false.`)
}

const textParam = (query, name) => {
  const raw = query[name]
  if (raw === undefined || raw === '') return null
  if (String(raw).length > 60) throw bad(`"${name}" is too long.`)
  return String(raw).trim().toLowerCase()
}

/** Rejects misspelt parameters instead of silently ignoring them. */
function onlyParams(query, allowed) {
  const unknown = Object.keys(query).filter((key) => !allowed.includes(key))
  if (unknown.length) {
    throw bad(`Unknown parameter${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Allowed: ${allowed.join(', ')}.`)
  }
}

/* ------------------------------------------------------------- resources */

/** The public shape of a planting day. Ratings merge seed history and live totals. */
function toEventResource(e, stats, baseUrl) {
  const live = stats[e.id] ?? { count: 0, sum: 0 }
  const ratingCount = e.ratingCount + (live.count ?? 0)
  const ratingSum = e.ratingSum + (live.sum ?? 0)
  return {
    id: e.id,
    title: e.title,
    activity: e.activityType,
    // Same rule as the website's badge: an open day with no places left is full.
    status: e.isPast ? 'completed' : e.status === 'open' && e.registered >= e.capacity ? 'full' : e.status,
    date: e.date,
    startTime: e.startTime,
    endTime: e.endTime,
    timezone: 'Australia/Melbourne',
    description: e.description,
    capacity: e.capacity,
    registered: e.registered,
    spotsLeft: Math.max(0, e.capacity - e.registered),
    familyFriendly: e.familyFriendly,
    toolsProvided: e.toolsProvided,
    wheelchairAccessible: e.wheelchairAccessible,
    rating: ratingCount ? { average: Number((ratingSum / ratingCount).toFixed(2)), count: ratingCount } : null,
    site: { id: e.site.id, name: e.site.name, suburb: e.site.suburb, href: `${baseUrl}/sites/${e.site.id}` },
    links: { self: `${baseUrl}/events/${e.id}` }
  }
}

function toSiteResource(site, baseUrl) {
  return {
    id: site.id,
    name: site.name,
    suburb: site.suburb,
    postcode: site.postcode,
    council: site.council,
    location: { lat: site.lat, lng: site.lng },
    meetingPoint: site.meetingPoint,
    species: site.species,
    canopyCoverPercent: site.canopyCover,
    wheelchairAccessible: site.wheelchairAccessible,
    links: { self: `${baseUrl}/sites/${site.id}`, events: `${baseUrl}/events?site=${site.id}` }
  }
}

/* ---------------------------------------------------------------- routes */

const EVENT_PARAMS = ['suburb', 'site', 'activity', 'from', 'to', 'upcoming', 'familyFriendly', 'limit', 'offset']

function listEventsRoute(query, { stats, baseUrl }) {
  onlyParams(query, EVENT_PARAMS)
  const suburb = textParam(query, 'suburb')
  const site = textParam(query, 'site')
  const activity = textParam(query, 'activity')
  const from = dateParam(query, 'from')
  const to = dateParam(query, 'to')
  const upcoming = boolParam(query, 'upcoming')
  const familyFriendly = boolParam(query, 'familyFriendly')
  const limit = intParam(query, 'limit', { min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT })
  const offset = intParam(query, 'offset', { min: 0, max: 10000, fallback: 0 })
  if (from && to && from > to) throw bad('"from" must not be after "to".')

  const matches = listPublicEvents()
    .filter((e) => !suburb || e.site.suburb.toLowerCase() === suburb)
    .filter((e) => !site || e.siteId === site)
    .filter((e) => !activity || e.activityType.toLowerCase().includes(activity))
    .filter((e) => !from || e.date >= from)
    .filter((e) => !to || e.date <= to)
    .filter((e) => upcoming === null || (upcoming ? !e.isPast : e.isPast))
    .filter((e) => familyFriendly === null || e.familyFriendly === familyFriendly)
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))

  const page = matches.slice(offset, offset + limit)
  const pageUrl = (nextOffset) => {
    const params = new URLSearchParams({ ...query, limit: String(limit), offset: String(nextOffset) })
    return `${baseUrl}/events?${params}`
  }

  return {
    data: page.map((e) => toEventResource(e, stats, baseUrl)),
    meta: { total: matches.length, count: page.length, limit, offset },
    links: {
      self: pageUrl(offset),
      next: offset + limit < matches.length ? pageUrl(offset + limit) : null,
      prev: offset > 0 ? pageUrl(Math.max(0, offset - limit)) : null
    }
  }
}

function getEventRoute(id, query, { stats, baseUrl }) {
  onlyParams(query, [])
  const event = listPublicEvents().find((e) => e.id === id)
  if (!event) throw new ApiError(404, 'not_found', `No published planting day with id "${id}".`)
  return { data: toEventResource(event, stats, baseUrl) }
}

function listSitesRoute(query, { baseUrl }) {
  onlyParams(query, ['suburb'])
  const suburb = textParam(query, 'suburb')
  const sites = listSites().filter((s) => !suburb || s.suburb.toLowerCase() === suburb)
  return { data: sites.map((s) => toSiteResource(s, baseUrl)), meta: { total: sites.length } }
}

function getSiteRoute(id, query, { baseUrl }) {
  onlyParams(query, [])
  const site = listSites().find((s) => s.id === id)
  if (!site) throw new ApiError(404, 'not_found', `No site with id "${id}".`)
  return { data: toSiteResource(site, baseUrl) }
}

function indexRoute(baseUrl) {
  return {
    data: {
      name: 'GreenRoots Melbourne public API',
      version: API_VERSION,
      documentation: `${baseUrl}/openapi.json`,
      endpoints: {
        events: `${baseUrl}/events`,
        event: `${baseUrl}/events/{id}`,
        sites: `${baseUrl}/sites`,
        site: `${baseUrl}/sites/{id}`
      }
    }
  }
}

/* --------------------------------------------------------------- handler */

const SECURITY_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  // Public, read-only data with no cookies or credentials: any site may call
  // it from a browser.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'If-None-Match',
  'Access-Control-Expose-Headers': 'ETag, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After'
}

/**
 * request: { method, path, query, headers, baseUrl }
 * deps:    { stats } — live rating totals by event id
 * returns: { status, headers, body } — body is a string ('' for 204/304)
 */
export function handleApiRequest(request, deps = {}) {
  const { method, path, query = {}, headers = {}, baseUrl } = request
  const stats = deps.stats ?? {}

  const respond = (status, payload, extraHeaders = {}) => ({
    status,
    headers: { ...SECURITY_HEADERS, ...extraHeaders },
    body: payload === null ? '' : JSON.stringify(payload, null, 2)
  })

  if (method === 'OPTIONS') return respond(204, null, { 'Access-Control-Max-Age': '86400' })

  try {
    if (method !== 'GET' && method !== 'HEAD') {
      throw Object.assign(new ApiError(405, 'method_not_allowed', 'This API is read-only. Use GET.'), {
        headers: { Allow: 'GET, HEAD, OPTIONS' }
      })
    }

    const parts = path.replace(/\/+$/, '').split('/').filter(Boolean)
    if (parts[0] !== API_VERSION) {
      throw new ApiError(404, 'not_found', `Unknown path. The API lives under /${API_VERSION}, e.g. /${API_VERSION}/events.`)
    }

    const ctx = { stats, baseUrl }
    const [, resource, id, extra] = parts
    let payload
    if (extra) throw new ApiError(404, 'not_found', 'Unknown path.')
    else if (!resource) payload = indexRoute(baseUrl)
    else if (resource === 'openapi.json' && !id) payload = openApiSpec(baseUrl)
    else if (resource === 'events') payload = id ? getEventRoute(id, query, ctx) : listEventsRoute(query, ctx)
    else if (resource === 'sites') payload = id ? getSiteRoute(id, query, ctx) : listSitesRoute(query, ctx)
    else throw new ApiError(404, 'not_found', `Unknown resource "${resource}". Try /${API_VERSION}/events or /${API_VERSION}/sites.`)

    // Conditional requests: a client that already has this exact response
    // sends its ETag back and gets an empty 304 instead of the whole body.
    const body = JSON.stringify(payload, null, 2)
    const etag = `"${createHash('sha1').update(body).digest('base64url').slice(0, 27)}"`
    const cacheHeaders = { ETag: etag, 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' }
    if (headers['if-none-match'] === etag) return { status: 304, headers: { ...SECURITY_HEADERS, ...cacheHeaders }, body: '' }

    return { status: 200, headers: { ...SECURITY_HEADERS, ...cacheHeaders }, body: method === 'HEAD' ? '' : body }
  } catch (err) {
    if (err instanceof ApiError) {
      return respond(err.status, { error: { status: err.status, code: err.code, message: err.message } }, err.headers)
    }
    throw err
  }
}

/* ---------------------------------------------------------- rate limiting */

/**
 * A sliding window of 60 requests a minute per client IP.
 *
 * Kept in the instance's memory rather than in Firestore: a database write on
 * every read would cost more than the read itself. The trade-off is that the
 * limit is per instance; with the function capped at a few instances, the
 * effective ceiling stays a small multiple of 60. IPs are hashed before they
 * are used as keys, so no address is held in memory either.
 */
export function createRateLimiter({ limit = 60, windowMs = 60_000, now = () => Date.now() } = {}) {
  const hits = new Map()
  return function take(ip) {
    const key = createHash('sha256').update(String(ip)).digest('base64url').slice(0, 16)
    const t = now()
    const recent = (hits.get(key) ?? []).filter((ts) => ts > t - windowMs)
    const allowed = recent.length < limit
    if (allowed) recent.push(t)
    hits.set(key, recent)
    // Stop the map growing without bound under many distinct callers.
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (!v.some((ts) => ts > t - windowMs)) hits.delete(k)
    }
    const resetSeconds = Math.ceil(((recent[0] ?? t) + windowMs - t) / 1000)
    return {
      allowed,
      headers: {
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': String(Math.max(0, limit - recent.length)),
        'X-RateLimit-Reset': String(resetSeconds),
        ...(allowed ? {} : { 'Retry-After': String(resetSeconds) })
      }
    }
  }
}

export const tooManyRequests = (headers) => ({
  status: 429,
  headers: { ...SECURITY_HEADERS, ...headers },
  body: JSON.stringify({
    error: { status: 429, code: 'rate_limited', message: 'Too many requests. Wait a minute and try again.' }
  }, null, 2)
})
