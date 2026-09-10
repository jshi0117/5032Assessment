<script setup>
import { computed, onMounted, ref } from 'vue'

import { useAdminStore } from '@/stores/adminStore'
import { useAuthStore } from '@/stores/authStore'
import { linkableVolunteers } from '@/services/userService'
import BaseAlert from '@/components/base/BaseAlert.vue'

/**
 * Account and role administration (BR C.2).
 *
 * This is the screen the whole role system hangs off: registration always
 * creates a volunteer, so every coordinator and administrator is made here.
 *
 * Two things it deliberately will not do. It will not let an administrator
 * change their own role, because the last one to demote themselves would leave
 * nobody able to undo it. And it does not treat hiding this page as the
 * protection — the Firestore rules refuse a role write from a non-administrator
 * whatever this client chooses to render.
 */
const admin = useAdminStore()
const auth = useAuthStore()

const search = ref('')
const roleFilter = ref('')
const saving = ref(null)
const saveError = ref(null)
const saved = ref(null)

onMounted(() => admin.load())

const ROLE_OPTIONS = [
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'coordinator', label: 'Coordinator' },
  { value: 'admin', label: 'Administrator' }
]

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  return admin.users.filter((user) => {
    if (roleFilter.value && user.role !== roleFilter.value) return false
    if (!query) return true
    return [user.name, user.email, user.suburb].join(' ').toLowerCase().includes(query)
  })
})

const isSelf = (user) => user.uid === auth.account?.uid

async function changeRole(user, role) {
  if (role === user.role) return
  saving.value = user.uid
  saveError.value = null
  saved.value = null
  try {
    await admin.setRole(user.uid, role, auth.account?.uid)
    saved.value = `${user.name} is now a ${ROLE_OPTIONS.find((o) => o.value === role).label.toLowerCase()}.`
  } catch (err) {
    saveError.value = err?.message ?? 'That change could not be saved.'
  } finally {
    saving.value = null
  }
}

async function changeVolunteer(user, volunteerId) {
  saving.value = user.uid
  saveError.value = null
  saved.value = null
  try {
    await admin.setVolunteerId(user.uid, volunteerId)
    saved.value = volunteerId
      ? `${user.name} is linked to ${volunteerId}.`
      : `${user.name} is no longer linked to a volunteer record.`
  } catch (err) {
    saveError.value = err?.message ?? 'That change could not be saved.'
  } finally {
    saving.value = null
  }
}
</script>

<template>
  <div class="container gr-users">
    <p class="text-body-secondary small mb-1">Administrator</p>
    <h1 class="h3 mb-1">Accounts</h1>
    <p class="text-body-secondary mb-4">
      Everyone who has registered. Registration always creates a volunteer, so
      coordinators and administrators are promoted here.
    </p>

    <BaseAlert v-if="admin.error" variant="danger" title="Could not load accounts">
      {{ admin.error }}
    </BaseAlert>

    <template v-else>
      <BaseAlert v-if="saveError" variant="danger" title="Change not saved">
        {{ saveError }}
      </BaseAlert>
      <BaseAlert v-if="saved" variant="success">{{ saved }}</BaseAlert>

      <div class="row g-3 mb-3">
        <div class="col-sm-7">
          <label class="form-label" for="field-userSearch">Search accounts</label>
          <input
            id="field-userSearch"
            v-model="search"
            class="form-control"
            type="search"
            placeholder="Name, email or suburb"
          />
        </div>
        <div class="col-sm-5">
          <label class="form-label" for="field-roleFilter">Role</label>
          <select id="field-roleFilter" v-model="roleFilter" class="form-select">
            <option value="">All roles</option>
            <option v-for="option in ROLE_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
      </div>

      <p class="small text-body-secondary" role="status">
        Showing {{ filtered.length }} of {{ admin.users.length }} accounts.
      </p>

      <p v-if="admin.loading" role="status">Loading accounts…</p>

      <div v-else class="table-responsive">
        <table class="table align-middle">
          <caption class="visually-hidden">Accounts, their roles and linked volunteer records</caption>
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Role</th>
              <th scope="col">Linked volunteer</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in filtered" :key="user.uid">
              <th scope="row" class="fw-normal">
                <!-- Interpolated, never v-html. Names and suburbs are typed by
                     the account holder, so they are rendered as text. -->
                {{ user.name }}
                <span class="d-block small text-body-secondary text-break">{{ user.email }}</span>
                <span v-if="isSelf(user)" class="badge text-bg-light mt-1">You</span>
              </th>
              <td>
                <label class="visually-hidden" :for="`role-${user.uid}`">
                  Role for {{ user.email }}
                </label>
                <select
                  :id="`role-${user.uid}`"
                  class="form-select form-select-sm"
                  :value="user.role"
                  :disabled="saving === user.uid || isSelf(user)"
                  @change="changeRole(user, $event.target.value)"
                >
                  <option v-for="option in ROLE_OPTIONS" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
                <span v-if="isSelf(user)" class="form-text">
                  You cannot change your own role.
                </span>
              </td>
              <td>
                <label class="visually-hidden" :for="`volunteer-${user.uid}`">
                  Linked volunteer record for {{ user.email }}
                </label>
                <select
                  :id="`volunteer-${user.uid}`"
                  class="form-select form-select-sm"
                  :value="user.volunteerId ?? ''"
                  :disabled="saving === user.uid"
                  @change="changeVolunteer(user, $event.target.value)"
                >
                  <option value="">Not linked</option>
                  <option v-for="option in linkableVolunteers" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
                <span v-if="user.role === 'coordinator' && !user.volunteerId" class="form-text text-warning-emphasis">
                  Link this account so their planting days appear.
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.gr-users {
  padding-block: 2rem 4rem;
}
</style>
