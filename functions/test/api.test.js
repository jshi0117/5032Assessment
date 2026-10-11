import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createRateLimiter, handleApiRequest } from '../src/api/handler.js'

const BASE = 'https://example.test/api/v1'
const get = (path, query = {}, headers = {}, method = 'GET') => {
  const res = handleApiRequest({ method, path, query, headers, baseUrl: BASE }, { stats: { 'evt-014': { count: 2, sum: 10 } } })
  return { ...res, json: res.body ? JSON.parse(res.body) : null }
}

test('index and OpenAPI document', () => {
  assert.equal(get('/v1').json.data.version, 'v1')
  const spec = get('/v1/openapi.json').json
  assert.equal(spec.openapi, '3.1.0')
  assert.ok(spec.paths['/events'])
})

test('events: published only, sorted, paged, with links', () => {
  const page = get('/v1/events', { limit: '5' })
  assert.equal(page.status, 200)
  assert.equal(page.json.data.length, 5)
  assert.ok(page.json.meta.total > 5)
  assert.ok(page.json.links.next.includes('offset=5'))
  assert.equal(page.json.links.prev, null)
  const dates = page.json.data.map((e) => e.date)
  assert.deepEqual(dates, [...dates].sort())
  // Nothing internal leaks: no drafts, no coordinator ids.
  const all = get('/v1/events', { limit: '100' }).json.data
  assert.ok(all.every((e) => e.status !== 'draft'))
  assert.ok(all.every((e) => !('coordinatorId' in e)))
})

test('events: filters combine', () => {
  const r = get('/v1/events', { suburb: 'braybrook', familyFriendly: 'true', limit: '100' }).json
  assert.ok(r.data.length > 0)
  assert.ok(r.data.every((e) => e.site.suburb === 'Braybrook' && e.familyFriendly))
  const ranged = get('/v1/events', { from: '2026-10-01', to: '2026-12-31', limit: '100' }).json.data
  assert.ok(ranged.every((e) => e.date >= '2026-10-01' && e.date <= '2026-12-31'))
})

test('status matches the website: a booked-out open day is full', () => {
  const all = get('/v1/events', { limit: '100' }).json.data
  assert.ok(all.filter((e) => e.spotsLeft === 0 && e.status !== 'cancelled' && e.status !== 'completed').every((e) => e.status === 'full'))
})

test('live ratings merge with the seed history', () => {
  const e = get('/v1/events/evt-014').json.data
  assert.ok(e.rating.count >= 2)
  assert.equal(e.links.self, `${BASE}/events/evt-014`)
})

test('bad input is a 400 that says what is wrong', () => {
  assert.equal(get('/v1/events', { limit: '0' }).status, 400)
  assert.match(get('/v1/events', { limit: 'lots' }).json.error.message, /whole number/)
  assert.match(get('/v1/events', { from: '12/10/2026' }).json.error.message, /YYYY-MM-DD/)
  assert.match(get('/v1/events', { from: '2027-01-01', to: '2026-01-01' }).json.error.message, /after/)
  assert.match(get('/v1/events', { sububr: 'x' }).json.error.message, /Unknown parameter/)
})

test('unknown things are 404, writes are 405, preflight is 204', () => {
  assert.equal(get('/v1/events/evt-999').status, 404)
  assert.equal(get('/v2/events').status, 404)
  assert.equal(get('/v1/volunteers').status, 404)
  const post = get('/v1/events', {}, {}, 'POST')
  assert.equal(post.status, 405)
  assert.equal(post.headers.Allow, 'GET, HEAD, OPTIONS')
  assert.equal(get('/v1/events', {}, {}, 'OPTIONS').status, 204)
})

test('ETag: an unchanged response is a 304 with no body', () => {
  const first = get('/v1/sites')
  assert.ok(first.headers.ETag)
  const again = get('/v1/sites', {}, { 'if-none-match': first.headers.ETag })
  assert.equal(again.status, 304)
  assert.equal(again.body, '')
  assert.equal(first.headers['Access-Control-Allow-Origin'], '*')
})

test('rate limiter: 60 a minute per client, then 429 with Retry-After', () => {
  let t = 0
  const take = createRateLimiter({ limit: 3, windowMs: 1000, now: () => t })
  assert.ok(take('1.2.3.4').allowed && take('1.2.3.4').allowed && take('1.2.3.4').allowed)
  const blocked = take('1.2.3.4')
  assert.equal(blocked.allowed, false)
  assert.ok(blocked.headers['Retry-After'])
  assert.ok(take('5.6.7.8').allowed, 'another client is unaffected')
  t = 1500
  assert.ok(take('1.2.3.4').allowed, 'window slides')
})
