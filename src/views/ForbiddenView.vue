<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

/**
 * Shown when a signed-in user reaches a page their role does not cover
 * (BR C.2).
 *
 * Deliberately not a bare "403". Someone who is legitimately signed in and has
 * simply followed a link meant for a coordinator needs to know which account
 * they are using, what it can do, and where to go instead — a blank refusal
 * reads as a broken site.
 */
const route = useRoute()
const auth = useAuthStore()

const ROLE_LABELS = {
  volunteer: 'Volunteer',
  coordinator: 'Coordinator',
  admin: 'Administrator'
}

/** The page they were trying to reach, passed on by the guard. */
const attempted = computed(() =>
  typeof route.query.from === 'string' ? route.query.from : null
)

// Written out rather than assembled from an article and a label: "a
// administrator" is what building it by concatenation produces.
const ROLE_PHRASES = {
  volunteer: 'a volunteer account',
  coordinator: 'a coordinator account',
  admin: 'an administrator account'
}

const requiredRoles = computed(() => {
  const raw = route.query.needs
  if (typeof raw !== 'string') return []
  return raw.split(',').filter((role) => role in ROLE_LABELS)
})

const requiredLabel = computed(() => {
  const roles = requiredRoles.value
  if (roles.length === 0) return 'a different role'
  if (roles.length === 1) return ROLE_PHRASES[roles[0]]
  const labels = roles.map((role) => ROLE_LABELS[role].toLowerCase())
  return `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)} access`
})

const currentLabel = computed(() => ROLE_LABELS[auth.role] ?? null)
</script>

<template>
  <div class="container gr-forbidden">
    <p class="text-body-secondary small mb-1">Error 403</p>
    <h1 class="h3 mb-3">You do not have access to that page</h1>

    <p>
      <template v-if="attempted">
        <code class="gr-forbidden__path">{{ attempted }}</code> needs
      </template>
      <template v-else>That page needs</template>
      {{ requiredLabel }}.
      <template v-if="currentLabel">
        You are signed in as <strong>{{ auth.displayName }}</strong>, whose
        account is a {{ currentLabel.toLowerCase() }}.
      </template>
    </p>

    <p class="text-body-secondary">
      If you believe your account should have that access, ask an administrator
      to change your role.
    </p>

    <div class="d-flex flex-wrap gap-2 mt-4">
      <RouterLink class="btn btn-primary" :to="{ name: 'home' }">Back to home</RouterLink>
      <RouterLink class="btn btn-outline-secondary" :to="{ name: 'events' }">
        Browse planting days
      </RouterLink>
      <RouterLink class="btn btn-outline-secondary" :to="{ name: 'account' }">
        Your account
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.gr-forbidden {
  max-width: 40rem;
  padding-block: 3rem 5rem;
}

.gr-forbidden__path {
  word-break: break-all;
}
</style>
