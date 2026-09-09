import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

import { auth, db, persistenceReady } from './firebase'

/**
 * The only place authentication and user profiles enter or leave the app
 * (BR C.1, and the data C.2 authorises against).
 *
 * Firebase Authentication owns credentials — the application never sees or
 * stores a password. It does not, however, carry application roles, so each
 * account has a companion document at `users/{uid}` holding the profile and the
 * role. Auth answers "who is this?"; that document answers "what may they do?".
 *
 * Components never import this module; the store does. Same one-way rule the
 * event layer already follows.
 */

/** The roles the application recognises, least privileged first (BR C.2). */
export const ROLES = ['volunteer', 'coordinator', 'admin']

export const DEFAULT_ROLE = 'volunteer'

const userRef = (uid) => doc(db, 'users', uid)

/**
 * Turns a Firebase error into something a person can act on.
 *
 * The raw messages are written for developers ("Firebase: Error
 * (auth/invalid-credential)") and naming which half of a sign-in was wrong
 * would confirm to a stranger whether an address has an account here, so the
 * sign-in failures deliberately collapse into one message.
 */
const MESSAGES = {
  'auth/email-already-in-use':
    'An account already exists for that email address. Try signing in instead.',
  'auth/invalid-email': 'That email address does not look right.',
  'auth/weak-password': 'Choose a password of at least 8 characters.',
  'auth/invalid-credential': 'Email address or password is incorrect.',
  'auth/wrong-password': 'Email address or password is incorrect.',
  'auth/user-not-found': 'Email address or password is incorrect.',
  'auth/user-disabled': 'That account has been disabled. Contact a coordinator.',
  'auth/too-many-requests':
    'Too many attempts from this device. Wait a few minutes and try again.',
  'auth/network-request-failed':
    'Could not reach the server. Check your connection and try again.',
  'auth/operation-not-allowed':
    'Email sign-in is not enabled for this project. Enable it in the Firebase console.',
  'auth/unauthorized-domain':
    'This site is not on the project’s authorised domains list.',
  'permission-denied': 'You do not have permission to do that.'
}

export function describeAuthError(err) {
  return MESSAGES[err?.code] ?? 'Something went wrong. Please try again.'
}

/** Only the fields the app reads — never the whole Firebase user object. */
function toAccount(user) {
  if (!user) return null
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName ?? null,
    emailVerified: user.emailVerified
  }
}

function toProfile(uid, data) {
  return {
    uid,
    firstName: data?.firstName ?? '',
    lastName: data?.lastName ?? '',
    email: data?.email ?? '',
    suburb: data?.suburb ?? '',
    // An unrecognised or missing role is treated as the least privileged one.
    // Failing closed matters here: a corrupt document must not hand out access.
    role: ROLES.includes(data?.role) ? data.role : DEFAULT_ROLE,
    createdAt: data?.createdAt ?? null
  }
}

/**
 * Reads the profile for a signed-in account, creating one if it is missing.
 *
 * The gap is real: an account created in the Firebase console, or one whose
 * profile write failed after the credential was created, would otherwise have
 * no role and be locked out of every guarded page.
 */
export async function fetchProfile(uid, fallback = {}) {
  const snapshot = await getDoc(userRef(uid))
  if (snapshot.exists()) return toProfile(uid, snapshot.data())

  const profile = {
    firstName: fallback.firstName ?? '',
    lastName: fallback.lastName ?? '',
    email: fallback.email ?? '',
    suburb: fallback.suburb ?? '',
    role: DEFAULT_ROLE,
    createdAt: serverTimestamp()
  }
  await setDoc(userRef(uid), profile)
  return toProfile(uid, { ...profile, createdAt: null })
}

/**
 * Creates an account and its profile.
 *
 * `role` is hard-coded rather than taken from the caller. The registration form
 * has no role field and must never gain one: a client-supplied role would let
 * anyone sign up as an administrator. Promotion happens from the admin screens,
 * behind the Firestore rules (BR C.2).
 */
export async function registerUser({ firstName, lastName, email, password, suburb = '' }) {
  await persistenceReady
  const { user } = await createUserWithEmailAndPassword(auth, email, password)

  const displayName = `${firstName} ${lastName}`.trim()
  if (displayName) await updateProfile(user, { displayName })

  await setDoc(userRef(user.uid), {
    firstName,
    lastName,
    email: user.email,
    suburb,
    role: DEFAULT_ROLE,
    createdAt: serverTimestamp()
  })

  return {
    account: toAccount({ ...user, displayName }),
    profile: toProfile(user.uid, { firstName, lastName, email: user.email, suburb, role: DEFAULT_ROLE })
  }
}

export async function loginUser(email, password) {
  await persistenceReady
  const { user } = await signInWithEmailAndPassword(auth, email, password)
  return { account: toAccount(user), profile: await fetchProfile(user.uid, { email: user.email }) }
}

export async function logoutUser() {
  await signOut(auth)
}

/**
 * Starts a password reset.
 *
 * Resolves the same way whether or not the address has an account: reporting
 * "no such user" here would turn this form into a way of testing which email
 * addresses are registered.
 */
export async function requestPasswordReset(email) {
  try {
    await sendPasswordResetEmail(auth, email)
  } catch (err) {
    if (err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-email') return
    throw err
  }
}

/** Profile edits the account owner is allowed to make. Never touches `role`. */
export async function updateOwnProfile(uid, { firstName, lastName, suburb }) {
  await updateDoc(userRef(uid), { firstName, lastName, suburb })
  if (auth.currentUser?.uid === uid) {
    await updateProfile(auth.currentUser, { displayName: `${firstName} ${lastName}`.trim() })
  }
}

/**
 * Subscribes to sign-in state. `callback` receives the account, or null.
 * Returns the unsubscribe function.
 */
export function observeAuth(callback) {
  return onAuthStateChanged(auth, (user) => callback(toAccount(user)))
}
