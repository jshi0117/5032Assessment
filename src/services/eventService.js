import seedEvents from '@/data/events.json'
import seedSites from '@/data/sites.json'
import { read, write } from './storage'
import { volunteerKeyFromEmail } from '@/utils/format'

/**
 * The only place event data enters or leaves the application.
 *
 * Seed + overlay: the imported JSON is treated as immutable reference data and
 * is never written to. Everything the user does — registering, rating — is kept
 * in a single localStorage record and merged on read. That keeps registrations
 * alive across a refresh (BR B.2) while leaving the seed clean enough to reset.
 *
 * Every function is async even though nothing here awaits, so that swapping the
 * body for a Firestore call (BR D.1 / E.1) changes no caller.
 */
const OVERLAY_KEY = 'events-overlay'

const sitesById = Object.fromEntries(seedSites.map((s) => [s.id, s]))

/**
 * Today in Melbourne, as YYYY-MM-DD.
 *
 * `toISOString()` would give the UTC date. Melbourne runs 10–11 hours ahead, so
 * between local midnight and mid-morning the UTC date is still yesterday, and
 * a planting day that has already happened would keep showing as upcoming and
 * accepting registrations. en-CA is used because it formats as YYYY-MM-DD.
 */
const MELBOURNE_TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Australia/Melbourne',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

const todayIso = () => MELBOURNE_TODAY.format(new Date())

/**
 * A registration used to be stored as a bare volunteer id. It now carries the
 * places booked and the contact details, so anything left in a browser from the
 * earlier shape is converted on read.
 *
 * Without this the count still adds up — an id falls back to one place — but
 * `volunteerId` reads as undefined, which silently defeats the duplicate check
 * and makes the record impossible to cancel.
 */
function normaliseRegistration(entry) {
  if (typeof entry === 'string') return { volunteerId: migrateVolunteerId(entry), places: 1 }
  if (entry && typeof entry === 'object' && entry.volunteerId) {
    // Rebuilt field by field rather than spread. An earlier version stored the
    // volunteer's name, email, phone, suburb and notes alongside the booking;
    // spreading would carry those personal details forward indefinitely on a
    // possibly shared device. Only what the application actually reads survives.
    return {
      volunteerId: migrateVolunteerId(entry.volunteerId),
      places: Number(entry.places) || 1
    }
  }
  return null
}

/**
 * Converts a guest key that still holds a readable email address into the
 * digest form. Without this an existing registration would no longer match the
 * key derived at sign-up, so the same person could book a second time.
 */
function migrateVolunteerId(volunteerId) {
  const id = String(volunteerId)
  if (id.startsWith('guest:') && id.includes('@')) {
    return volunteerKeyFromEmail(id.slice('guest:'.length))
  }
  return id
}

/** Keeps the first booking per volunteer, since one per event is the rule. */
function dedupeByVolunteer(entries) {
  const seen = new Set()
  return entries.filter((entry) => {
    if (seen.has(entry.volunteerId)) return false
    seen.add(entry.volunteerId)
    return true
  })
}

function loadOverlay() {
  const stored = read(OVERLAY_KEY, null)

  const registrations = {}
  for (const [eventId, entries] of Object.entries(stored?.registrations ?? {})) {
    const cleaned = dedupeByVolunteer(
      (Array.isArray(entries) ? entries : []).map(normaliseRegistration).filter(Boolean)
    )
    if (cleaned.length) registrations[eventId] = cleaned
  }

  const ratings = {}
  for (const [eventId, entries] of Object.entries(stored?.ratings ?? {})) {
    const cleaned = dedupeByVolunteer(
      (Array.isArray(entries) ? entries : [])
        .filter((r) => r && r.volunteerId && Number.isFinite(r.rating))
        .map((r) => ({ volunteerId: migrateVolunteerId(r.volunteerId), rating: Number(r.rating) }))
    )
    if (cleaned.length) ratings[eventId] = cleaned
  }

  const overlay = { registrations, ratings }

  // Filtering in memory is not enough: the discarded personal details and the
  // duplicate bookings would stay on the device until something happened to
  // overwrite them. If cleaning changed anything, the tidied version is written
  // straight back so the stale data is actually gone.
  //
  // A failed write is ignored on purpose — being unable to tidy up must not
  // stop the page reading its data.
  if (stored && JSON.stringify(stored) !== JSON.stringify(overlay)) {
    write(OVERLAY_KEY, overlay)
  }

  return overlay
}

/**
 * Persists the overlay, or throws.
 *
 * `write` returns false when localStorage refuses — private browsing, a full
 * quota, storage disabled. Swallowing that leaves the screen showing a change
 * that will be gone on the next reload, which is worse than an error.
 */
function saveOverlay(overlay) {
  if (!write(OVERLAY_KEY, overlay)) {
    throw new Error(
      'That change could not be saved on this device. Check whether your browser is blocking site storage, then try again.'
    )
  }
}

/**
 * Joins an event to its site and folds in the local overlay, returning the
 * shape the UI actually renders. Derived values are computed here rather than
 * stored, so `capacity`/`registered` can never disagree with `spotsLeft`.
 */
function hydrate(event, overlay) {
  const site = sitesById[event.siteId] ?? null
  const localRegistrations = overlay.registrations[event.id] ?? []
  const localRatings = overlay.ratings[event.id] ?? []

  // A registration can hold several places — a parent booking for the family —
  // so places are summed rather than counted.
  const registered =
    event.registered + localRegistrations.reduce((sum, r) => sum + (r.places ?? 1), 0)
  const ratingCount = event.ratingCount + localRatings.length
  const ratingSum =
    event.ratingSum + localRatings.reduce((sum, r) => sum + r.rating, 0)

  const isPast = event.date < todayIso()
  const isFull = registered >= event.capacity

  return {
    ...event,
    site,
    // Derived rather than stored, so the title can never contradict the site.
    title: site ? `${site.name} — ${event.activityType}` : event.activityType,
    suburb: site?.suburb ?? null,
    registered,
    spotsLeft: Math.max(0, event.capacity - registered),
    isFull,
    isPast,
    // `status` is the scheduled state; this is what the badge shows.
    displayStatus:
      event.status === 'open' && isFull ? 'full' : event.status,
    ratingCount,
    ratingSum,
    averageRating: ratingCount
      ? Number((ratingSum / ratingCount).toFixed(1))
      : null,
    localRegistrations,
    registeredVolunteerIds: localRegistrations.map((r) => r.volunteerId)
  }
}

export async function listEvents() {
  const overlay = loadOverlay()
  return seedEvents.map((event) => hydrate(event, overlay))
}

export async function getEvent(id) {
  const overlay = loadOverlay()
  const event = seedEvents.find((e) => e.id === id)
  return event ? hydrate(event, overlay) : null
}

export async function listSites() {
  return seedSites.map((site) => ({ ...site }))
}

/**
 * Records a registration.
 *
 * These checks are the second line of validation behind the form's own
 * (BR B.1): the form stops most bad input, but capacity and duplicates can only
 * be judged against current data. When this moves to a cloud function the same
 * rules run server-side.
 */
/**
 * Records a registration.
 *
 * Only the volunteer id and the number of places are stored. The name, phone,
 * suburb and notes the form collects are deliberately not persisted: nothing in
 * the application reads them back, so keeping them in localStorage would put
 * personal details on a possibly shared device for no benefit. They belong in
 * Firestore behind an account once BR C.1 and D.1 land.
 */
export async function registerForEvent(eventId, volunteerId, details = {}) {
  const { places = 1 } = details

  const overlay = loadOverlay()
  const seed = seedEvents.find((e) => e.id === eventId)
  if (!seed) throw new Error(`Unknown event: ${eventId}`)

  const event = hydrate(seed, overlay)
  if (event.isPast) throw new Error('That planting day has already taken place.')
  if (event.status === 'cancelled') throw new Error('That planting day has been cancelled.')
  if (event.status === 'draft') throw new Error('That planting day is not open for registration yet.')
  if (event.registeredVolunteerIds.includes(volunteerId)) {
    throw new Error('You are already registered for that planting day.')
  }
  if (!Number.isInteger(places)) {
    throw new Error('Number of places must be a whole number.')
  }
  if (places < 1) {
    throw new Error('Choose at least one place.')
  }
  // Checked against live data rather than the form: places left can change
  // between the page loading and the form being submitted.
  if (places > event.spotsLeft) {
    throw new Error(
      event.spotsLeft === 0
        ? 'That planting day is fully booked.'
        : `Only ${event.spotsLeft} ${event.spotsLeft === 1 ? 'place is' : 'places are'} left on that planting day.`
    )
  }

  overlay.registrations[eventId] = [
    ...event.localRegistrations,
    { volunteerId, places }
  ]
  saveOverlay(overlay)
  return hydrate(seed, overlay)
}

export async function cancelRegistration(eventId, volunteerId) {
  const overlay = loadOverlay()
  const seed = seedEvents.find((e) => e.id === eventId)
  if (!seed) throw new Error(`Unknown event: ${eventId}`)

  const remaining = (overlay.registrations[eventId] ?? []).filter(
    (r) => r.volunteerId !== volunteerId
  )
  if (remaining.length) overlay.registrations[eventId] = remaining
  else delete overlay.registrations[eventId]

  saveOverlay(overlay)
  return hydrate(seed, overlay)
}

/**
 * Stores one rating. Kept as sum + count rather than an average so a new score
 * can be folded in without losing the earlier ones (BR C.3).
 */
export async function rateEvent(eventId, volunteerId, rating) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('A rating must be a whole number from 1 to 5.')
  }
  const overlay = loadOverlay()
  const seed = seedEvents.find((e) => e.id === eventId)
  if (!seed) throw new Error(`Unknown event: ${eventId}`)

  const existing = overlay.ratings[eventId] ?? []
  overlay.ratings[eventId] = [
    ...existing.filter((r) => r.volunteerId !== volunteerId),
    { volunteerId, rating }
  ]
  saveOverlay(overlay)
  return hydrate(seed, overlay)
}

/** Drops local changes and returns the seed data untouched. */
export async function resetLocalChanges() {
  saveOverlay({ registrations: {}, ratings: {} })
  return listEvents()
}
