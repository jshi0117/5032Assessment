import { ref } from 'vue'
import { defineStore } from 'pinia'

import * as emailService from '@/services/emailService'

/**
 * Email (BR D.2), sent through Cloud Functions (BR E.1).
 *
 * Components call these actions; only this store talks to the service — the
 * same one-way rule as the event and auth stores.
 */
export const useEmailStore = defineStore('email', () => {
  /** eventId currently being emailed, so only that button shows as busy. */
  const sendingDetailsFor = ref(null)
  const composing = ref(false)

  async function emailEventDetails(eventId) {
    sendingDetailsFor.value = eventId
    try {
      return await emailService.emailEventDetails(eventId)
    } catch (err) {
      throw new Error(emailService.describeEmailError(err), { cause: err })
    } finally {
      sendingDetailsFor.value = null
    }
  }

  /**
   * `files` are File objects; they are read to base64 here so the view deals
   * only in what the user picked.
   */
  async function sendComposed({ to, subject, message, eventId, files = [], copyToSelf }) {
    composing.value = true
    try {
      const attachments = await Promise.all(
        files.map(async (file) => ({
          filename: file.name,
          type: file.type,
          content: await emailService.fileToBase64(file)
        }))
      )
      return await emailService.sendComposedEmail({
        to, subject, message, eventId: eventId || undefined, attachments, copyToSelf
      })
    } catch (err) {
      throw new Error(emailService.describeEmailError(err), { cause: err })
    } finally {
      composing.value = false
    }
  }

  return {
    sendingDetailsFor, composing,
    limits: emailService.EMAIL_LIMITS,
    attachmentTypes: emailService.ATTACHMENT_TYPES,
    emailEventDetails, sendComposed
  }
})
