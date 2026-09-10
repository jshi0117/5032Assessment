import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore'

import { db } from './firebase'

/**
 * Volunteer ratings for planting days (BR C.3).
 *
 * Two collections, on purpose:
 *
 *   `eventRatings/{eventId}__{uid}` — one document per person per planting day.
 *     The id is derived rather than generated, which is what makes "one rating
 *     each" a property of the data instead of a rule the client remembers to
 *     follow: a second rating from the same person addresses the same document
 *     and replaces it.
 *
 *   `eventStats/{eventId}` — the running total: how many ratings, their sum,
 *     and how many of each score.
 *
 * The average is stored as sum and count rather than as an average, so a new
 * score folds in without the earlier ones having to be re-read. Keeping the
 * total also means the list page can show every planting day's average from one
 * small read, instead of fetching every individual rating.
 *
 * The pair is written in a transaction. Without one, two people rating the same
 * planting day at the same moment would both read the same total and the second
 * write would erase the first.
 */
export const MIN_SCORE = 1
export const MAX_SCORE = 5

const ratingId = (eventId, uid) => `${eventId}__${uid}`

const emptyStats = () => ({ count: 0, sum: 0, buckets: [0, 0, 0, 0, 0] })

/** Reads a stats document into a shape the UI can rely on. */
function toStats(data) {
  const buckets = Array.isArray(data?.buckets) ? data.buckets : []
  return {
    count: Number(data?.count) || 0,
    sum: Number(data?.sum) || 0,
    // Padded to five, so a document written by an older version — or a partial
    // one — cannot make the distribution bars read past the end of the array.
    buckets: Array.from({ length: 5 }, (_, index) => Number(buckets[index]) || 0)
  }
}

export function isValidScore(score) {
  return Number.isInteger(score) && score >= MIN_SCORE && score <= MAX_SCORE
}

/**
 * Every planting day's totals, as `{ [eventId]: stats }`.
 *
 * One read for the whole list. Ratings are public — the averages are shown to
 * signed-out visitors — so this is not behind a sign-in.
 */
export async function listStats() {
  const snapshot = await getDocs(collection(db, 'eventStats'))
  return Object.fromEntries(snapshot.docs.map((entry) => [entry.id, toStats(entry.data())]))
}

export async function getStats(eventId) {
  const snapshot = await getDoc(doc(db, 'eventStats', eventId))
  return snapshot.exists() ? toStats(snapshot.data()) : emptyStats()
}

/** This person's own score for one planting day, or null if they have not rated it. */
export async function getMyRating(eventId, uid) {
  if (!uid) return null
  const snapshot = await getDoc(doc(db, 'eventRatings', ratingId(eventId, uid)))
  if (!snapshot.exists()) return null
  const score = Number(snapshot.data()?.score)
  return isValidScore(score) ? score : null
}

/**
 * Records or replaces one person's rating, and returns the new totals.
 *
 * Re-rating adjusts the totals rather than adding to them: the old score is
 * taken back out of the sum and its bucket before the new one goes in, so
 * changing a 5 to a 3 moves the average instead of counting the person twice.
 */
export async function submitRating(eventId, uid, score) {
  if (!uid) throw new Error('You need to be signed in to rate a planting day.')
  if (!isValidScore(score)) {
    throw new Error('A rating must be a whole number from 1 to 5.')
  }

  const ratingRef = doc(db, 'eventRatings', ratingId(eventId, uid))
  const statsRef = doc(db, 'eventStats', eventId)

  return runTransaction(db, async (transaction) => {
    // Both reads first: a Firestore transaction does not allow a read after a
    // write within the same transaction.
    const [existingRating, existingStats] = await Promise.all([
      transaction.get(ratingRef),
      transaction.get(statsRef)
    ])

    const stats = existingStats.exists() ? toStats(existingStats.data()) : emptyStats()
    const buckets = [...stats.buckets]
    let { count, sum } = stats

    const previous = existingRating.exists() ? Number(existingRating.data()?.score) : null
    if (isValidScore(previous)) {
      if (previous === score) {
        // Nothing to change. Returning early keeps a double-click from writing
        // a second identical document and touching the timestamp for nothing.
        return { stats, score, changed: false }
      }
      count -= 1
      sum -= previous
      buckets[previous - 1] = Math.max(0, buckets[previous - 1] - 1)
    }

    count += 1
    sum += score
    buckets[score - 1] += 1

    transaction.set(ratingRef, {
      eventId,
      uid,
      score,
      updatedAt: serverTimestamp()
    })
    transaction.set(statsRef, { eventId, count, sum, buckets })

    return { stats: { count, sum, buckets }, score, changed: true }
  })
}
