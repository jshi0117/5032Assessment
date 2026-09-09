import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import * as authService from '@/services/authService'
import { DEFAULT_ROLE, ROLES } from '@/services/authService'

/**
 * Who is signed in, and what they are allowed to do (BR C.1 / C.2).
 *
 * Two pieces of state, deliberately kept apart:
 *   `account` — identity, owned by Firebase Authentication
 *   `profile` — application data including the role, owned by Firestore
 *
 * `ready` is the one that matters for the route guards. Firebase restores a
 * session asynchronously, so for the first moment after a reload nobody is
 * signed in as far as the client can tell. A guard that ran then would bounce a
 * signed-in administrator to the login page on every refresh, so guards await
 * `whenReady()` instead of reading `isAuthenticated` straight away.
 */
export const useAuthStore = defineStore('auth', () => {
  const account = ref(null)
  const profile = ref(null)
  const ready = ref(false)
  const error = ref(null)

  let unsubscribe = null
  let resolveReady
  const readyPromise = new Promise((resolve) => { resolveReady = resolve })

  const isAuthenticated = computed(() => account.value !== null)

  /** Signed-out visitors have no role at all, which is not the same as a weak one. */
  const role = computed(() => (isAuthenticated.value ? (profile.value?.role ?? DEFAULT_ROLE) : null))

  const isAdmin = computed(() => role.value === 'admin')
  const isCoordinator = computed(() => role.value === 'coordinator' || isAdmin.value)

  const displayName = computed(() => {
    const first = profile.value?.firstName?.trim()
    if (first) return first
    return account.value?.displayName?.trim() || account.value?.email || 'Account'
  })

  const initials = computed(() => {
    const { firstName = '', lastName = '' } = profile.value ?? {}
    const letters = `${firstName.charAt(0)}${lastName.charAt(0)}`.trim()
    return (letters || account.value?.email?.charAt(0) || '?').toUpperCase()
  })

  /** True when the signed-in user holds one of `allowed`. Empty list means any. */
  function hasRole(allowed) {
    if (!allowed || allowed.length === 0) return isAuthenticated.value
    return role.value !== null && allowed.includes(role.value)
  }

  function clear() {
    account.value = null
    profile.value = null
  }

  /**
   * Begins watching sign-in state. Called once from main.js.
   *
   * The listener also fires on sign-in and sign-out, so the profile is loaded
   * here rather than in the login action — that way a session restored from
   * storage arrives with its role attached, exactly like a fresh sign-in.
   */
  function init() {
    if (unsubscribe) return readyPromise

    unsubscribe = authService.observeAuth(async (next) => {
      account.value = next
      if (next) {
        try {
          profile.value = await authService.fetchProfile(next.uid, { email: next.email })
          error.value = null
        } catch (err) {
          // The role cannot be established, so the user stays at their least
          // privileged. Signing them out would be worse: they are legitimately
          // authenticated and the public pages still work.
          profile.value = null
          error.value = authService.describeAuthError(err)
        }
      } else {
        profile.value = null
      }
      if (!ready.value) {
        ready.value = true
        resolveReady()
      }
    })

    return readyPromise
  }

  /** Resolves once the first sign-in state has arrived. */
  const whenReady = () => (ready.value ? Promise.resolve() : readyPromise)

  async function register(details) {
    const { account: nextAccount, profile: nextProfile } = await authService.registerUser(details)
    account.value = nextAccount
    profile.value = nextProfile
    return nextProfile
  }

  async function login(email, password) {
    const { account: nextAccount, profile: nextProfile } = await authService.loginUser(email, password)
    account.value = nextAccount
    profile.value = nextProfile
    return nextProfile
  }

  async function logout() {
    await authService.logoutUser()
    clear()
  }

  const requestPasswordReset = (email) => authService.requestPasswordReset(email)

  /**
   * Changes the password. Sign-in state is untouched — Firebase keeps the
   * session alive after a password change, so there is nothing to update here.
   */
  const changePassword = (currentPassword, newPassword) =>
    authService.changeOwnPassword(currentPassword, newPassword)

  async function updateProfileDetails(details) {
    if (!account.value) throw new Error('You need to be signed in to do that.')
    await authService.updateOwnProfile(account.value.uid, details)
    profile.value = { ...profile.value, ...details }
  }

  return {
    account, profile, ready, error,
    isAuthenticated, role, isAdmin, isCoordinator, displayName, initials,
    ROLES,
    hasRole, init, whenReady,
    register, login, logout, requestPasswordReset, changePassword, updateProfileDetails
  }
})
