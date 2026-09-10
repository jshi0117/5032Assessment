import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import * as userService from '@/services/userService'

/**
 * The accounts an administrator manages (BR C.2).
 *
 * Separate from authStore, which holds the one account that is signed in. This
 * one is only ever populated behind an admin-guarded route, so nothing about
 * other people's accounts is fetched — or held in memory — for a volunteer.
 */
export const useAdminStore = defineStore('admin', () => {
  const users = ref([])
  const loading = ref(false)
  const error = ref(null)
  const loaded = ref(false)

  async function load({ force = false } = {}) {
    if (loaded.value && !force) return
    loading.value = true
    error.value = null
    try {
      users.value = await userService.listUsers()
      loaded.value = true
    } catch (err) {
      error.value =
        err?.code === 'permission-denied'
          ? 'You do not have permission to view accounts.'
          : (err?.message ?? 'Accounts could not be loaded.')
    } finally {
      loading.value = false
    }
  }

  /** Replaces one row in place so the table does not flicker after a write. */
  function patch(uid, changes) {
    const index = users.value.findIndex((user) => user.uid === uid)
    if (index !== -1) users.value[index] = { ...users.value[index], ...changes }
  }

  async function setRole(uid, role, actingUid) {
    await userService.updateUserRole(uid, role, actingUid)
    patch(uid, { role })
  }

  async function setVolunteerId(uid, volunteerId) {
    await userService.updateUserVolunteerId(uid, volunteerId)
    patch(uid, { volunteerId: volunteerId || null })
  }

  const byRole = computed(() =>
    users.value.reduce((counts, user) => {
      counts[user.role] = (counts[user.role] ?? 0) + 1
      return counts
    }, {})
  )

  return { users, loading, error, loaded, byRole, load, setRole, setVolunteerId }
})
