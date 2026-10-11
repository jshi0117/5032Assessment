import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signInWithPopup,
  signInWithRedirect,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

import { sanitizeEmail, sanitizeText } from '@/utils/sanitize'
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
  'auth/requires-recent-login':
    'For your security, sign in again before making that change.',
  'auth/too-many-requests':
    'Too many attempts from this device. Wait a few minutes and try again.',
  'auth/network-request-failed':
    'Could not reach the server. Check your connection and try again.',
  'auth/operation-not-allowed':
    'Email sign-in is not enabled for this project. Enable it in the Firebase console.',
  'auth/unauthorized-domain':
    'This site is not on the project’s authorised domains list.',
  'permission-denied': 'You do not have permission to do that.',
  'auth/popup-blocked':
    'Your browser blocked the Google sign-in window. Allow pop-ups for this site, or try again.',
  'auth/account-exists-with-different-credential':
    'That email address already has a GreenRoots password. Sign in with your email and password instead.',
  'auth/user-token-expired': 'Your session has expired. Please sign in again.'
}

/**
 * Google sign-in errors that are the user changing their mind, not failures.
 * Shown as nothing at all rather than as an error banner.
 */
export const isCancelledSignIn = (err) =>
  ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'].includes(err?.code)

/**
 * `overrides` re-words a code for a screen where the shared wording would be
 * wrong. `auth/wrong-password` means "email or password is incorrect" on the
 * sign-in form, but on the change-password form the email is not in question
 * and only the current password can be at fault.
 */
export function describeAuthError(err, overrides = {}) {
  const code = err?.code
  return (
    overrides[code] ?? MESSAGES[code] ?? 'Something went wrong. Please try again.'
  )
}

/** Only the fields the app reads — never the whole Firebase user object. */
function toAccount(user) {
  if (!user) return null
  const providers = (user.providerData ?? []).map((p) => p.providerId)
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName ?? null,
    emailVerified: user.emailVerified,
    // 'password', 'google.com' — which ways this account can sign in. The
    // account page uses it: a Google-only account has no password to change.
    providers,
    hasPassword: providers.includes('password')
  }
}

/**
 * Where the link in the verification email returns to. The account page reads
 * `?verified=1` and refreshes the account, so the banner clears on arrival.
 * Built from the current origin, so it works locally and once deployed (the
 * domain must be on Firebase Auth's authorised list, which localhost and the
 * Firebase Hosting domains are by default).
 */
const verificationSettings = () => ({
  url: `${window.location.origin}/account?verified=1`,
  handleCodeInApp: false
})

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
    /**
     * Which volunteer in the seed data this account is, when an administrator
     * has linked them. It is what tells /manage which planting days a
     * coordinator runs; an unlinked coordinator is authorised but owns nothing.
     */
    volunteerId: data?.volunteerId ?? null,
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

  // Sanitised here rather than only in the form (BR C.4). The form is one
  // caller; this is the boundary every caller has to cross, so cleaning it here
  // is what makes it true of the stored data rather than of one screen.
  // The password is never touched — it is a credential, not text to be tidied,
  // and it is not stored by this application in any case.
  const clean = {
    firstName: sanitizeText(firstName, { maxLength: 40 }),
    lastName: sanitizeText(lastName, { maxLength: 40 }),
    email: sanitizeEmail(email),
    suburb: sanitizeText(suburb, { maxLength: 60 })
  }

  const { user } = await createUserWithEmailAndPassword(auth, clean.email, password)

  const displayName = `${clean.firstName} ${clean.lastName}`.trim()
  if (displayName) await updateProfile(user, { displayName })

  await setDoc(userRef(user.uid), {
    firstName: clean.firstName,
    lastName: clean.lastName,
    email: user.email,
    suburb: clean.suburb,
    role: DEFAULT_ROLE,
    createdAt: serverTimestamp()
  })

  // Proves the address belongs to whoever registered it. A failure here must
  // not undo a registration that has already succeeded: the account exists,
  // and the email can be resent from the banner or the account page.
  let verificationSent = true
  try {
    await sendEmailVerification(user, verificationSettings())
  } catch {
    verificationSent = false
  }

  return {
    verificationSent,
    account: toAccount({ ...user, displayName, providerData: user.providerData }),
    profile: toProfile(user.uid, { ...clean, email: user.email, role: DEFAULT_ROLE })
  }
}

export async function loginUser(email, password) {
  await persistenceReady
  const { user } = await signInWithEmailAndPassword(auth, sanitizeEmail(email), password)
  return { account: toAccount(user), profile: await fetchProfile(user.uid, { email: user.email }) }
}

/**
 * "Continue with Google" (BR D.1).
 *
 * A pop-up keeps the page — and anything typed on it — where it is. Where the
 * browser blocks pop-ups (common on phones and in strict privacy settings) it
 * falls back to a full-page redirect, which returns to this site and is
 * finished by `completeRedirectSignIn` below.
 *
 * Google has already verified the address, so these accounts arrive with
 * `emailVerified: true` and never see the verification banner. A first sign-in
 * creates the profile, as a volunteer, through the same path as any account
 * missing one — the Firestore rules pin that role whatever the client sends.
 */
export async function signInWithGoogle() {
  await persistenceReady
  const provider = new GoogleAuthProvider()
  // Always show the account chooser, so someone with two Google accounts (a
  // personal and a university one, say) is never signed in with the wrong one.
  provider.setCustomParameters({ prompt: 'select_account' })

  let user
  try {
    ;({ user } = await signInWithPopup(auth, provider))
  } catch (err) {
    if (err?.code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, provider)
      return null // the page is navigating away
    }
    throw err
  }
  return { account: toAccount(user), profile: await fetchProfile(user.uid, googleNames(user)) }
}

/** Surfaces the outcome — or the error — of a redirect sign-in on return. */
export async function completeRedirectSignIn() {
  const result = await getRedirectResult(auth)
  return result?.user ? toAccount(result.user) : null
}

/** First and last name from a Google profile, trimmed to the profile limits. */
function googleNames(user) {
  const [first = '', ...rest] = (user.displayName ?? '').trim().split(/\s+/)
  return {
    firstName: sanitizeText(first, { maxLength: 40 }),
    lastName: sanitizeText(rest.join(' '), { maxLength: 40 }),
    email: user.email
  }
}

/** Sends the verification email again, for the signed-in account. */
export async function resendVerificationEmail() {
  const user = auth.currentUser
  if (!user) throw new Error('You need to be signed in to do that.')
  if (user.emailVerified) return false
  await sendEmailVerification(user, verificationSettings())
  return true
}

/**
 * Re-reads the account from Firebase after the link has been followed.
 *
 * `reload` updates `emailVerified` on the client; forcing a new ID token puts
 * the `email_verified` claim into the token the Cloud Functions check — without
 * it, the server would go on seeing an unverified account for up to an hour.
 */
export async function refreshAccount() {
  const user = auth.currentUser
  if (!user) return null
  await reload(user)
  if (user.emailVerified) await user.getIdToken(true)
  return toAccount(user)
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
    await sendPasswordResetEmail(auth, sanitizeEmail(email))
  } catch (err) {
    if (err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-email') return
    throw err
  }
}

/**
 * Changes the signed-in account's password (BR C.1 — account management).
 *
 * The current password is re-checked first. Firebase requires a recent sign-in
 * before a password change, and that requirement is worth having on its own:
 * without it, anyone who reached an unlocked screen could lock the owner out of
 * their own account in two keystrokes.
 *
 * `updatePassword` runs only after the re-check succeeds, so a wrong current
 * password fails before anything is written.
 */
export async function changeOwnPassword(currentPassword, newPassword) {
  const user = auth.currentUser
  if (!user?.email) throw new Error('You need to be signed in to change your password.')

  const credential = EmailAuthProvider.credential(user.email, currentPassword)
  await reauthenticateWithCredential(user, credential)
  await updatePassword(user, newPassword)
}

/** Profile edits the account owner is allowed to make. Never touches `role`. */
export async function updateOwnProfile(uid, { firstName, lastName, suburb }) {
  const clean = {
    firstName: sanitizeText(firstName, { maxLength: 40 }),
    lastName: sanitizeText(lastName, { maxLength: 40 }),
    suburb: sanitizeText(suburb, { maxLength: 60 })
  }
  await updateDoc(userRef(uid), clean)
  if (auth.currentUser?.uid === uid) {
    await updateProfile(auth.currentUser, {
      displayName: `${clean.firstName} ${clean.lastName}`.trim()
    })
  }
  // The cleaned values are returned so the caller stores and shows what was
  // actually written, rather than the raw text the form still holds.
  return clean
}

/**
 * Subscribes to sign-in state. `callback` receives the account, or null.
 * Returns the unsubscribe function.
 */
export function observeAuth(callback) {
  return onAuthStateChanged(auth, (user) => callback(toAccount(user)))
}
