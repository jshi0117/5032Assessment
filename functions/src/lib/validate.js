import { HttpsError } from 'firebase-functions/https'

/**
 * Server-side validation for everything a caller sends.
 *
 * The browser validates the same rules so people get instant feedback, but a
 * callable function is a public endpoint: anything can be posted to it. These
 * checks are the ones that count.
 */

// Deliberately plain: one @, something either side, a dot in the domain, no
// spaces or angle brackets. SendGrid does the real deliverability checking.
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/

export const LIMITS = {
  recipients: 10,
  subject: 150,
  message: 5000,
  attachments: 3,
  // Callable requests are capped at 10 MB; base64 adds a third. 4 MB of files
  // keeps well inside that and inside what inboxes accept.
  attachmentBytes: 4 * 1024 * 1024
}

/** File types a coordinator may attach, by MIME type → allowed extensions. */
const ALLOWED_TYPES = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'text/csv': ['csv'],
  'text/plain': ['txt'],
  'text/calendar': ['ics']
}

const bad = (message) => new HttpsError('invalid-argument', message)

export function requireString(value, field, { max, required = true, singleLine = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw bad(`${field} is required.`)
    return ''
  }
  if (typeof value !== 'string') throw bad(`${field} must be text.`)
  const trimmed = value.trim()
  if (required && !trimmed) throw bad(`${field} is required.`)
  if (max && trimmed.length > max) throw bad(`${field} must be ${max} characters or fewer.`)
  // Control characters have no place in a subject or a message, and a CR/LF
  // in a header field is how header injection works.
  if (singleLine && /[\r\n]/.test(trimmed)) throw bad(`${field} must be a single line.`)
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(trimmed)) throw bad(`${field} contains characters that are not allowed.`)
  return trimmed
}

export function requireEventId(value) {
  const id = requireString(value, 'Planting day', { max: 20 })
  if (!/^evt-\d{3}$/.test(id)) throw bad('That planting day is not recognised.')
  return id
}

export function requireRecipients(value) {
  if (!Array.isArray(value) || !value.length) throw bad('Add at least one recipient.')
  const unique = [...new Set(value.map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : '')))]
  if (unique.length > LIMITS.recipients) throw bad(`Send to ${LIMITS.recipients} people or fewer at a time.`)
  const invalid = unique.filter((address) => address.length > 254 || !EMAIL.test(address))
  if (invalid.length) throw bad(`These addresses do not look right: ${invalid.slice(0, 3).join(', ') || '(blank)'}`)
  return unique
}

/** "Site plan (v2).pdf" → "Site-plan-v2.pdf"; never a path, never hidden. */
export function safeFilename(name, fallback = 'attachment') {
  const cleaned = String(name ?? '')
    .split(/[\\/]/).pop()
    .replace(/[^A-Za-z0-9._ -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 80)
  return cleaned || fallback
}

/**
 * Uploaded attachments: `{ filename, type, content (base64) }`.
 *
 * Checked on type, extension, decoded size and — for PDFs and images — the
 * file's own magic number, so a script renamed to `.pdf` is refused.
 */
export function requireAttachments(value) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw bad('Attachments are malformed.')
  if (value.length > LIMITS.attachments) throw bad(`Attach ${LIMITS.attachments} files or fewer.`)

  let total = 0
  return value.map((file, i) => {
    const filename = safeFilename(file?.filename, `attachment-${i + 1}`)
    const type = String(file?.type ?? '')
    const extension = filename.split('.').pop().toLowerCase()
    if (!ALLOWED_TYPES[type] || !ALLOWED_TYPES[type].includes(extension)) {
      throw bad(`${filename}: only PDF, PNG, JPG, CSV, TXT and ICS files can be attached.`)
    }
    if (typeof file.content !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.content)) {
      throw bad(`${filename} could not be read.`)
    }
    const content = Buffer.from(file.content, 'base64')
    total += content.length
    if (!content.length) throw bad(`${filename} is empty.`)
    if (total > LIMITS.attachmentBytes) throw bad('Attachments must add up to 4 MB or less.')
    if (!matchesSignature(type, content)) throw bad(`${filename} is not really a ${extension.toUpperCase()} file.`)
    return { filename, type, content }
  })
}

function matchesSignature(type, bytes) {
  const starts = (...sig) => sig.every((b, i) => bytes[i] === b)
  switch (type) {
    case 'application/pdf': return starts(0x25, 0x50, 0x44, 0x46) // %PDF
    case 'image/png': return starts(0x89, 0x50, 0x4e, 0x47)
    case 'image/jpeg': return starts(0xff, 0xd8, 0xff)
    default: return !bytes.subarray(0, 1024).includes(0) // text: no NUL bytes
  }
}
