/**
 * Display formatting. Pure functions only — no Vue, no I/O.
 *
 * Dates in the data are plain ISO days ("2026-09-12") with no timezone. They are
 * parsed and formatted as UTC throughout: letting the browser interpret them in
 * local time shifts them a day backwards for anyone west of Greenwich, which in
 * Melbourne would show every Saturday planting day as a Friday.
 */
const AU = 'en-AU'
const asUtcDate = (iso) => new Date(`${iso}T00:00:00Z`)

const dateFormat = (options) =>
  new Intl.DateTimeFormat(AU, { timeZone: 'UTC', ...options })

const LONG = dateFormat({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const MEDIUM = dateFormat({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const SHORT = dateFormat({ day: '2-digit', month: 'short', year: 'numeric' })

/** "Saturday 12 September 2026" */
export const formatDateLong = (iso) => (iso ? LONG.format(asUtcDate(iso)) : '')

/**
 * "Sat, 12 Sep 2026" — the year is always shown because the list spans more
 * than one, and without it a run of Aug -> Nov -> Mar reads as mis-sorted.
 */
export const formatDateMedium = (iso) => (iso ? MEDIUM.format(asUtcDate(iso)) : '')

/** "12 Sep 2026" — used where the table needs a fixed width */
export const formatDateShort = (iso) => (iso ? SHORT.format(asUtcDate(iso)) : '')

/** "9:00am" from "09:00" */
export function formatTime(hhmm) {
  if (!hhmm) return ''
  const [hours, minutes] = hhmm.split(':').map(Number)
  const suffix = hours < 12 ? 'am' : 'pm'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return minutes === 0 ? `${hour12}${suffix}` : `${hour12}:${String(minutes).padStart(2, '0')}${suffix}`
}

/** "9am – 12pm" */
export const formatTimeRange = (start, end) =>
  start && end ? `${formatTime(start)} – ${formatTime(end)}` : ''

/** "3 spots left" / "1 spot left" / "Fully booked" */
export function formatSpots(spotsLeft) {
  if (spotsLeft <= 0) return 'Fully booked'
  return `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left`
}

/** "4.2" or an em dash when nobody has rated it yet */
export const formatRating = (average) =>
  average === null || average === undefined ? '—' : average.toFixed(1)

/** Rounds to whole stars for the visual rating, keeping the number as the label. */
export const starsFor = (average) => Math.round(average ?? 0)

/*
 * Kept short on purpose. These render as a badge beside the suburb badge, and
 * at the xxl breakpoint the pair share about 197px. After the longest suburb
 * name ("Broadmeadows", 109px) and the gap, roughly 80px is left — which
 * "Fully booked" (92px) and "Completed" (82px) both overrun, pushing the badge
 * past the card edge. Anything here must stay under that budget.
 */
const STATUS_LABELS = {
  open: 'Open',
  full: 'Full',
  draft: 'Draft',
  cancelled: 'Cancelled',
  completed: 'Past'
}

export const formatStatus = (status) => STATUS_LABELS[status] ?? status

/** Bootstrap badge class per status, so the colour never contradicts the word. */
const STATUS_VARIANTS = {
  open: 'text-bg-success',
  full: 'text-bg-secondary',
  draft: 'text-bg-light',
  cancelled: 'text-bg-danger',
  completed: 'text-bg-light'
}

export const statusVariant = (status) => STATUS_VARIANTS[status] ?? 'text-bg-light'

/**
 * Derives a stable, opaque key from an email address.
 *
 * Registrations are keyed by whoever made them so a repeat booking can be
 * spotted, but the key is stored on the device and there is no reason for it to
 * be a readable email address — anyone opening the browser's storage on a
 * shared machine would see who had signed up. A digest keeps the comparison
 * working while leaving nothing legible behind. It is not a security measure:
 * it removes casual disclosure, not a determined lookup.
 */
export function volunteerKeyFromEmail(email) {
  const normalised = String(email).trim().toLowerCase()
  let hash = 5381
  for (let i = 0; i < normalised.length; i++) {
    hash = ((hash << 5) + hash + normalised.charCodeAt(i)) | 0
  }
  return `guest:${(hash >>> 0).toString(36)}`
}

export const formatActivity = (activityType) =>
  activityType ? activityType.charAt(0).toUpperCase() + activityType.slice(1) : ''
