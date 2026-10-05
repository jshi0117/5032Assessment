import { ref } from 'vue'
import { defineStore } from 'pinia'

import * as userService from '@/services/userService'

/**
 * The volunteer roster coordinators and administrators work from (BR D.3).
 *
 * Only populated behind a coordinator-guarded route, the same way adminStore
 * is only populated behind an administrator one.
 */
export const useVolunteerStore = defineStore('volunteers', () => {
  const volunteers = ref([])
  const loading = ref(false)
  const error = ref(null)
  const loaded = ref(false)

  async function load({ force = false } = {}) {
    if (loaded.value && !force) return
    loading.value = true
    error.value = null
    try {
      volunteers.value = await userService.listVolunteers()
      loaded.value = true
    } catch (err) {
      error.value = err?.message ?? 'The volunteer roster could not be loaded.'
    } finally {
      loading.value = false
    }
  }

  return { volunteers, loading, error, loaded, load }
})
