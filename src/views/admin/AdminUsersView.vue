<script setup>
import { onMounted, ref } from 'vue'

import { useAdminStore } from '@/stores/adminStore'
import { useAuthStore } from '@/stores/authStore'
import { linkableVolunteers } from '@/services/userService'
import BaseAlert from '@/components/base/BaseAlert.vue'
import InteractiveTable from '@/components/base/InteractiveTable.vue'

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

const saving = ref(null)
const saveError = ref(null)
const saved = ref(null)

onMounted(() => admin.load())

const ROLE_OPTIONS = [
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'coordinator', label: 'Coordinator' },
  { value: 'admin', label: 'Administrator' }
]

const roleLabel = (role) => ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role

/**
 * Table columns (BR D.3). Role and linked volunteer are edited in place, so
 * their cells are form controls; `value` is what they sort, filter and export by.
 */
const columns = [
  { key: 'name', label: 'Name', rowHeader: true },
  { key: 'email', label: 'Email' },
  { key: 'suburb', label: 'Suburb' },
  {
    key: 'role',
    label: 'Role',
    filter: 'select',
    options: ROLE_OPTIONS.map((option) => option.label),
    value: (user) => roleLabel(user.role)
  },
  {
    key: 'volunteerId',
    label: 'Linked volunteer',
    value: (user) => user.volunteerId ?? 'Not linked'
  }
]

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

      <p v-if="admin.loading" role="status">Loading accounts…</p>

      <InteractiveTable
        v-else
        :columns="columns"
        :rows="admin.users"
        row-key="uid"
        caption="Accounts, their roles and linked volunteer records"
        export-title="Accounts"
        :initial-sort="{ key: 'email', dir: 'asc' }"
      >
        <template #cell-name="{ row: user }">
          <!-- Interpolated, never v-html. Names and suburbs are typed by
               the account holder, so they are rendered as text. -->
          {{ user.name }}
          <span v-if="isSelf(user)" class="badge text-bg-light ms-1">You</span>
        </template>
        <template #cell-email="{ row: user }">
          <span class="text-nowrap">{{ user.email }}</span>
        </template>
        <template #cell-role="{ row: user }">
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
        </template>
        <template #cell-volunteerId="{ row: user }">
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
        </template>
      </InteractiveTable>
    </template>
  </div>
</template>

<style scoped>
.gr-users {
  padding-block: 2rem 4rem;
}
</style>
