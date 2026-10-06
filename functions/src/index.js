import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { setGlobalOptions } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/https'
import { logger } from 'firebase-functions'
import { defineSecret, defineString } from 'firebase-functions/params'

import { buildBriefingPdf } from './lib/briefingPdf.js'
import { getPlantingDay } from './lib/events.js'
import { escapeHtml, formatDateLong, formatTimeRange } from './lib/format.js'
import { buildIcs } from './lib/ics.js'
import { sendMail } from './lib/mailer.js'
import { takeQuota } from './lib/rateLimit.js'
import {
  LIMITS, requireAttachments, requireEventId, requireRecipients, requireString, safeFilename
} from './lib/validate.js'

/**
 * GreenRoots Melbourne — Cloud Functions (BR E.1) for email (BR D.2).
 *
 * Why these run on a server rather than in the browser:
 *   - The SendGrid API key is a real secret. Anything shipped to the browser
 *     can be read out of it, so the key lives in Secret Manager and only this
 *     code ever sees it.
 *   - Who may email whom is decided here, after Firebase has verified the
 *     caller's ID token — not by a button the browser chose to show.
 *   - The PDF briefing and calendar invite are built here from the canonical
 *     data, so a caller cannot put arbitrary content into them.
 *   - Serverless: nothing runs, and nothing is billed, between requests; Google
 *     scales instances up for a burst and back to zero after.
 */
initializeApp()

const SENDGRID_API_KEY = defineSecret('SENDGRID_API_KEY')
/** The SendGrid-verified sender address. */
const MAIL_FROM = defineString('MAIL_FROM')
/** Public address of the web app, for links in emails. */
const APP_URL = defineString('APP_URL', { default: 'http://localhost:5173' })

setGlobalOptions({
  // Sydney: the nearest region to Melbourne users and to the Firestore data.
  region: 'australia-southeast1',
  // A ceiling on scale-out, so a flood of calls cannot run up a bill.
  maxInstances: 5
})

const callableOptions = {
  secrets: [SENDGRID_API_KEY],
  // Reachable by anyone at the network level, as every callable must be: the
  // Firebase ID token is checked inside the handler (requireSignedIn), which
  // is where sign-in and roles are enforced. Stated explicitly so a failed
  // first deploy cannot leave a function without its invoker binding.
  invoker: 'public',
  // Browsers on the deployed site and on the Vite dev server only.
  cors: [/localhost:\d+$/, /\.web\.app$/, /\.firebaseapp\.com$/, /\.pages\.dev$/],
  timeoutSeconds: 30,
  memory: '512MiB'
}

/* ---------------------------------------------------------------- helpers */

function requireSignedIn(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to send email.')
  const email = request.auth.token.email
  if (!email) throw new HttpsError('failed-precondition', 'Your account has no email address.')
  return { uid: request.auth.uid, email }
}

/** Reads the role from users/{uid}, the same document the Firestore rules use. */
async function requireRole(uid, roles) {
  const snapshot = await getFirestore().collection('users').doc(uid).get()
  const role = snapshot.get('role') ?? 'volunteer'
  if (!roles.includes(role)) {
    throw new HttpsError('permission-denied', 'Only coordinators and administrators can compose emails.')
  }
  const name = [snapshot.get('firstName'), snapshot.get('lastName')].filter(Boolean).join(' ').trim()
  return { role, name }
}

const eventUrl = (day) => `${APP_URL.value().replace(/\/$/, '')}/events/${day.id}`

async function plantingDayAttachments(day) {
  const url = eventUrl(day)
  const pdf = await buildBriefingPdf(day, { url })
  const ics = Buffer.from(buildIcs(day, { url }), 'utf8')
  const base = safeFilename(`${day.site.name}-${day.date}`)
  return [
    { filename: `${base}-briefing.pdf`, type: 'application/pdf', content: pdf },
    { filename: `${base}.ics`, type: 'text/calendar', content: ics }
  ]
}

/** Plain text → HTML paragraphs, escaped. Blank lines separate paragraphs. */
const textToHtml = (text) =>
  text
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 1em">${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('')

function wrapHtml(bodyHtml, footer) {
  return `<!doctype html><html lang="en"><body style="margin:0;background:#f4f6f4">
<div style="max-width:560px;margin:0 auto;padding:24px;font:15px/1.5 Arial,Helvetica,sans-serif;color:#212529">
<div style="border-top:6px solid #2e7d32;background:#fff;padding:24px 24px 8px">
<p style="margin:0 0 16px;font-weight:bold;color:#1b5e20">GreenRoots Melbourne</p>
${bodyHtml}
</div>
<p style="font-size:12px;color:#5c636a;padding:12px 4px">${escapeHtml(footer)}</p>
</div></body></html>`
}

/** SendGrid failures become a message a person can act on; details go to the log. */
function mailFailure(err, context) {
  logger.error('SendGrid send failed', {
    ...context,
    status: err?.code,
    errors: err?.response?.body?.errors?.map((e) => e.message)
  })
  if (err?.code === 401 || err?.code === 403) {
    return new HttpsError('failed-precondition', 'Email is not set up correctly on the server. Please tell an administrator.')
  }
  return new HttpsError('unavailable', 'The email could not be sent just now. Please try again in a few minutes.')
}

/* ------------------------------------------------------ emailEventDetails */

/**
 * "Email me these details" — any signed-in user, to their own address only.
 *
 * Sending only to the caller's own verified sign-in address is what keeps
 * this from being an open relay: there is no recipient field to abuse.
 *
 * Request:  { eventId: 'evt-010' }
 * Response: { sentTo: 'a***@example.com', attachments: ['…pdf', '…ics'] }
 */
export const emailEventDetails = onCall(callableOptions, async (request) => {
  const { uid, email } = requireSignedIn(request)
  const eventId = requireEventId(request.data?.eventId)

  const day = getPlantingDay(eventId)
  if (!day) throw new HttpsError('not-found', 'That planting day could not be found.')

  await takeQuota(uid, { bucket: 'details', limit: 5 })

  const attachments = await plantingDayAttachments(day)
  const when = `${formatDateLong(day.date)}, ${formatTimeRange(day.startTime, day.endTime)}`
  const url = eventUrl(day)

  const text = [
    `Here are the details for ${day.title}.`,
    '',
    `When: ${when}`,
    `Where: ${day.site.name}, ${day.site.suburb}`,
    `Meeting point: ${day.site.meetingPoint}`,
    '',
    'Your briefing (PDF) and a calendar invitation are attached.',
    `Event page: ${url}`
  ].join('\n')

  const html = wrapHtml(
    `<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(day.title)}</h1>
<p style="margin:0 0 4px"><strong>When:</strong> ${escapeHtml(when)}</p>
<p style="margin:0 0 4px"><strong>Where:</strong> ${escapeHtml(`${day.site.name}, ${day.site.suburb}`)}</p>
<p style="margin:0 0 16px"><strong>Meeting point:</strong> ${escapeHtml(day.site.meetingPoint)}</p>
<p style="margin:0 0 16px">Your briefing (PDF) and a calendar invitation are attached.</p>
<p style="margin:0 0 16px"><a href="${escapeHtml(url)}" style="color:#1b5e20">View the planting day</a></p>`,
    'You asked for this email from the GreenRoots Melbourne website.'
  )

  try {
    await sendMail({
      apiKey: SENDGRID_API_KEY.value(),
      from: MAIL_FROM.value(),
      to: email,
      subject: `Your planting day: ${day.title}`,
      text,
      html,
      attachments
    })
  } catch (err) {
    throw mailFailure(err, { fn: 'emailEventDetails', uid, eventId })
  }

  logger.info('Planting day details emailed', { uid, eventId })
  return { sentTo: maskEmail(email), attachments: attachments.map((a) => a.filename) }
})

/* ------------------------------------------------------ sendComposedEmail */

/**
 * The coordinator's compose screen — coordinators and administrators only.
 *
 * Each recipient gets their own copy (so nobody sees anyone else's address),
 * from the GreenRoots sender, with Reply-To set to the coordinator so answers
 * reach a person. Attachments are the planting day's briefing and invitation,
 * generated here, and/or files the coordinator uploaded, checked by
 * validate.js.
 *
 * Request:  { to: string[], subject, message, eventId?, attachments?: [{ filename, type, content }],
 *             copyToSelf?: boolean }
 * Response: { recipients: number, attachments: string[] }
 */
export const sendComposedEmail = onCall({ ...callableOptions, memory: '1GiB' }, async (request) => {
  const { uid, email } = requireSignedIn(request)
  const { name } = await requireRole(uid, ['coordinator', 'admin'])

  const data = request.data ?? {}
  const to = requireRecipients(data.to)
  const subject = requireString(data.subject, 'Subject', { max: LIMITS.subject, singleLine: true })
  const message = requireString(data.message, 'Message', { max: LIMITS.message })
  const uploads = requireAttachments(data.attachments)

  let day = null
  if (data.eventId) {
    day = getPlantingDay(requireEventId(data.eventId))
    if (!day) throw new HttpsError('not-found', 'That planting day could not be found.')
  }


  const attachments = [...(day ? await plantingDayAttachments(day) : []), ...uploads]
  if (!attachments.length) {
    throw new HttpsError('invalid-argument', 'Attach the planting day briefing or a file.')
  }

  const sender = name || email
  const footer = `Sent by ${sender} through GreenRoots Melbourne. Reply to this email to answer them directly.`
  const html = wrapHtml(textToHtml(message), footer)
  const text = `${message}\n\n—\n${footer}`

  const recipients = data.copyToSelf && !to.includes(email.toLowerCase()) ? [...to, email] : to

  // Every recipient counts against the allowance, not every call.
  await takeQuota(uid, { bucket: 'compose', count: recipients.length, limit: 30 })

  try {
    // One message per recipient: personal, and no address is exposed to the others.
    await Promise.all(
      recipients.map((address) =>
        sendMail({
          apiKey: SENDGRID_API_KEY.value(),
          from: MAIL_FROM.value(),
          to: address,
          replyTo: email,
          subject,
          text,
          html,
          attachments
        })
      )
    )
  } catch (err) {
    throw mailFailure(err, { fn: 'sendComposedEmail', uid, recipients: recipients.length })
  }

  logger.info('Composed email sent', { uid, recipients: recipients.length, eventId: day?.id ?? null })
  return { recipients: recipients.length, attachments: attachments.map((a) => a.filename) }
})

/** "aarti.d@example.com" → "a***@example.com" — enough to recognise, not to harvest. */
function maskEmail(address) {
  const [user, domain] = address.split('@')
  return `${user.slice(0, 1)}***@${domain}`
}
