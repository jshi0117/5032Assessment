import { readFileSync } from 'node:fs'

/**
 * Planting days and sites, read from the copy of the web app's seed data
 * (see scripts/sync-data.mjs). Loaded once per instance and kept in memory.
 */
const load = (file) => JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8'))

const events = load('events.json')
const sitesById = new Map(load('sites.json').map((site) => [site.id, site]))

const MELBOURNE_TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Australia/Melbourne',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

const titleCase = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : '')

/**
 * The planting day with its site attached, or null if there is no such day.
 * Drafts are treated as not existing: they are not published to volunteers,
 * so they must not be emailed to them either.
 */
export function getPlantingDay(eventId) {
  const event = events.find((e) => e.id === eventId)
  if (!event || event.status === 'draft') return null
  const site = sitesById.get(event.siteId)
  if (!site) return null
  return {
    ...event,
    site,
    title: `${site.name} — ${event.activityType}`,
    activityLabel: titleCase(event.activityType),
    isPast: event.date < MELBOURNE_TODAY.format(new Date())
  }
}
