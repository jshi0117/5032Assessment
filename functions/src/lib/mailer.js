import sgMail from '@sendgrid/mail'

/**
 * Sends one email through the SendGrid v3 Mail Send API (BR D.2).
 *
 * The API key arrives as a Cloud Functions secret (Secret Manager) and is set
 * per call rather than at module load, because secrets are only readable
 * inside a function invocation.
 *
 * `attachments` are `{ filename, type, content: Buffer }`; SendGrid wants the
 * content base64-encoded, which happens here so callers deal in Buffers.
 */
export async function sendMail({ apiKey, from, to, replyTo, subject, text, html, attachments = [] }) {
  sgMail.setApiKey(apiKey)
  const [response] = await sgMail.send({
    to,
    from: { email: from, name: 'GreenRoots Melbourne' },
    ...(replyTo ? { replyTo } : {}),
    subject,
    text,
    html,
    attachments: attachments.map((file) => ({
      filename: file.filename,
      type: file.type,
      content: file.content.toString('base64'),
      disposition: 'attachment'
    })),
    // Transactional mail the user asked for: no click or open tracking, so
    // links in it are not rewritten and nothing is recorded about the reader.
    trackingSettings: {
      clickTracking: { enable: false, enableText: false },
      openTracking: { enable: false }
    }
  })
  return response?.headers?.['x-message-id'] ?? null
}
