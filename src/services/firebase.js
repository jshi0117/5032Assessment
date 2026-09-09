import { initializeApp } from 'firebase/app'
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

/**
 * The single Firebase entry point (BR C.1 / C.4).
 *
 * Configuration is read from the environment rather than written into the
 * source. These values are not secrets — everything the browser receives can be
 * read out of it, and Google publishes them as project identifiers — but
 * keeping them in .env.local means a clone runs against its own project and
 * this project's quota is not spendable by whoever reads the repository. What
 * actually protects the data is Firebase Authentication plus the Firestore
 * security rules, never the obscurity of these strings.
 *
 * Analytics is deliberately not initialised: nothing in the application reads
 * it, and loading it would set cookies that would then have to be disclosed and
 * consented to for no benefit.
 */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
}

// Fails loudly at start-up rather than as an opaque Firebase error on the first
// sign-in attempt, which is what a missing .env.local otherwise looks like.
const missing = Object.entries(config)
  .filter(([, value]) => !value)
  .map(([key]) => key)

if (missing.length) {
  throw new Error(
    `Firebase is not configured: ${missing.join(', ')} missing. ` +
      'Copy .env.example to .env.local and fill in the values from the Firebase console.'
  )
}

export const app = initializeApp(config)
export const auth = getAuth(app)
export const db = getFirestore(app)

/**
 * Keeps the session in localStorage so a refresh does not sign the user out.
 */
export const persistenceReady = setPersistence(auth, browserLocalPersistence).catch(
  () => undefined
)
