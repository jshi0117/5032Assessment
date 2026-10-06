/**
 * Display formatting for emails and the PDF — kept in step with the web app's
 * src/utils/format.js so a date reads the same in the inbox as on the site.
 * Dates are plain ISO days, formatted as UTC so no time zone shifts them.
 */
const LONG = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
})

/** "Saturday 12 September 2026" */
export const formatDateLong = (iso) => LONG.format(new Date(`${iso}T00:00:00Z`))

/** "9:00am" → "9am", "13:30" → "1:30pm" */
export function formatTime(hhmm) {
  const [hours, minutes] = hhmm.split(':').map(Number)
  const suffix = hours < 12 ? 'am' : 'pm'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return minutes === 0 ? `${hour12}${suffix}` : `${hour12}:${String(minutes).padStart(2, '0')}${suffix}`
}

export const formatTimeRange = (start, end) => `${formatTime(start)} – ${formatTime(end)}`

/** For text placed in the HTML email body. */
export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
