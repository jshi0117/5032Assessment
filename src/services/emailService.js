import { httpsCallable } from 'firebase/functions'

import { functions } from './firebase'

/**
 * The browser side of email (BR D.2), which is sent by Cloud Functions
 * (BR E.1) — see functions/src/index.js.
 *
 * Nothing here holds an API key or decides who may send what. The callable
 * SDK attaches the signed-in user's ID token to each request, and the
 * function checks it on the server.
 */

/** Same limits the server enforces, for instant feedback in the form. */
export const EMAIL_LIMITS = {
  recipients: 10,
  subject: 150,
  message: 5000,
  attachments: 3,
  attachmentBytes: 4 * 1024 * 1024
}

export const ATTACHMENT_TYPES = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'text/csv': ['csv'],
  'text/plain': ['txt'],
  'text/calendar': ['ics']
}

const MESSAGES = {
  'functions/unauthenticated': 'Sign in to send email.',
  'functions/permission-denied': 'Your account is not allowed to do that.',
  'functions/resource-exhausted': null, // the server's message says when to retry
  'functions/invalid-argument': null, // the server's message names the field
  'functions/not-found': null,
  'functions/unavailable': 'The email service could not be reached. Try again in a few minutes.',
  'functions/deadline-exceeded': 'Sending took too long. Check your inbox before trying again.',
  'functions/internal': 'Something went wrong on the server. Please try again.'
}

/** A FunctionsError → a sentence for the person who pressed Send. */
export function describeEmailError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'You appear to be offline. Your message has not been sent.'
  }
  const preset = MESSAGES[err?.code]
  if (preset) return preset
  return err?.message && err.code !== 'functions/internal'
    ? err.message
    : 'The email could not be sent. Please try again.'
}

const emailEventDetailsFn = httpsCallable(functions, 'emailEventDetails', { timeout: 30000 })
const sendComposedEmailFn = httpsCallable(functions, 'sendComposedEmail', { timeout: 60000 })

/** Emails the signed-in user the planting day's briefing PDF and calendar invite. */
export async function emailEventDetails(eventId) {
  const { data } = await emailEventDetailsFn({ eventId })
  return data
}

/**
 * Sends a coordinator's composed email.
 * `attachments` are `{ filename, type, content }` with base64 content.
 */
export async function sendComposedEmail(payload) {
  const { data } = await sendComposedEmailFn(payload)
  return data
}

/** Reads a File as base64 (without the data: URL prefix). */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error(`${file.name} could not be read.`))
    reader.readAsDataURL(file)
  })
}
