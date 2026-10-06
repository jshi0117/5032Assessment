import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/https'

/**
 * A per-account sending allowance.
 *
 * Every email costs money and reputation, and a callable function can be
 * invoked in a loop from a browser console. So each account may send a few
 * per hour, counted in Firestore inside a transaction so two simultaneous
 * calls cannot both squeeze under the limit.
 *
 * `count` is how many emails this request will send; `bucket` keeps separate
 * allowances for separate features.
 *
 * The `mailQuota` collection is closed to clients by the security rules; only
 * this code, running with the Admin SDK, can read or write it.
 */
export async function takeQuota(uid, { bucket = 'default', count = 1, limit = 5, windowMinutes = 60 } = {}) {
  const db = getFirestore()
  const ref = db.collection('mailQuota').doc(`${uid}_${bucket}`)
  const now = Date.now()
  const windowStart = now - windowMinutes * 60 * 1000

  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref)
    const recent = (snapshot.get('sentAt') ?? [])
      .map((t) => t.toMillis())
      .filter((ms) => ms > windowStart)

    if (recent.length + count > limit) {
      const retryMinutes = recent.length
        ? Math.max(1, Math.ceil((Math.min(...recent) + windowMinutes * 60 * 1000 - now) / 60000))
        : windowMinutes
      throw new HttpsError(
        'resource-exhausted',
        recent.length >= limit
          ? `You have sent ${limit} emails in the last hour. Try again in about ${retryMinutes} minute${retryMinutes === 1 ? '' : 's'}.`
          : `That would go over your limit of ${limit} emails an hour — ${limit - recent.length} left. Send to fewer people.`
      )
    }

    const added = Array.from({ length: count }, () => now)
    tx.set(ref, { sentAt: [...recent, ...added].map((ms) => Timestamp.fromMillis(ms)) })
  })
}
