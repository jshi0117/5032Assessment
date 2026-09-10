import { collection, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore'

import seedVolunteers from '@/data/volunteers.json'
import { db } from './firebase'
import { DEFAULT_ROLE, ROLES } from './authService'

/**
 * Administrator operations over the `users` collection (BR C.2).
 *
 * Kept apart from authService, which is about the signed-in person acting on
 * their own account. Everything here acts on somebody else's, so every function
 * is reachable only from a route guarded by `meta.roles: ['admin']` and is
 * refused by the Firestore rules for anyone else. The guard is the convenience;
 * the rules are the enforcement, because a guard only governs this client.
 */

/**
 * The volunteer records an account can be linked to.
 *
 * Only the coordinators: linking is what tells /manage which planting days
 * somebody runs, and only a coordinator record has any against it. Read here
 * rather than in the view so components never touch the seed files directly.
 */
export const linkableVolunteers = seedVolunteers
  .filter((volunteer) => volunteer.role === 'coordinator')
  .map((volunteer) => ({
    value: volunteer.id,
    label: `${volunteer.firstName} ${volunteer.lastName} (${volunteer.id})`
  }))

function toRow(snapshot) {
  const data = snapshot.data()
  return {
    uid: snapshot.id,
    firstName: data.firstName ?? '',
    lastName: data.lastName ?? '',
    name: `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim() || '(no name)',
    email: data.email ?? '',
    suburb: data.suburb ?? '',
    // An unrecognised role is reported as the least privileged one, matching
    // how authService reads it — the screen must not imply access that the
    // rest of the application will not grant.
    role: ROLES.includes(data.role) ? data.role : DEFAULT_ROLE,
    /**
     * Links the account to a volunteer in the seed data, which is what says
     * *which* planting days a coordinator runs. Without it a coordinator is
     * authorised but owns nothing, so /manage would be empty.
     */
    volunteerId: data.volunteerId ?? null,
    createdAt: data.createdAt?.toDate?.() ?? null
  }
}

export async function listUsers() {
  // Ordered by email because it is the one field every account is guaranteed to
  // have; sorting on a name would put accounts with no name in an arbitrary place.
  const snapshot = await getDocs(query(collection(db, 'users'), orderBy('email')))
  return snapshot.docs.map(toRow)
}

/**
 * Changes somebody's role.
 *
 * `actingUid` is compared here so an administrator cannot demote themselves —
 * the last administrator doing that would leave the project with no way back in
 * except the Firebase console.
 */
export async function updateUserRole(uid, role, actingUid) {
  if (!ROLES.includes(role)) throw new Error(`Unknown role: ${role}`)
  if (uid === actingUid) {
    throw new Error('You cannot change your own role. Ask another administrator.')
  }
  await updateDoc(doc(db, 'users', uid), { role })
}

/** Links or unlinks an account from a volunteer record in the seed data. */
export async function updateUserVolunteerId(uid, volunteerId) {
  await updateDoc(doc(db, 'users', uid), { volunteerId: volunteerId || null })
}
