<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/authStore'

/**
 * The header's account area (BR C.1).
 *
 * Signed out it offers sign-in and registration; signed in it shows who is
 * signed in, their role, and the way out. The menu is driven by Vue state
 * rather than Bootstrap's dropdown JS, matching AppHeader — that keeps
 * `aria-expanded` and the visible state from drifting apart.
 */
const props = defineProps({
  /** Stack for the mobile drawer instead of using a floating menu. */
  stacked: { type: Boolean, default: false }
})

const emit = defineEmits(['navigate'])

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const open = ref(false)
const root = ref(null)
const signingOut = ref(false)

/**
 * The current path, so signing in returns the visitor to where they were.
 *
 * Home and the authentication pages themselves are excluded: a redirect back to
 * /login or /register is either a no-op or a loop.
 */
const redirectQuery = computed(() =>
  route.name === 'home' || route.meta?.guestOnly ? {} : { redirect: route.fullPath }
)

const ROLE_LABELS = {
  volunteer: 'Volunteer',
  coordinator: 'Coordinator',
  admin: 'Administrator'
}

const roleLabel = computed(() => ROLE_LABELS[auth.role] ?? null)

function close() {
  open.value = false
}

function toggle() {
  open.value = !open.value
}

/** A click anywhere else dismisses the menu. Only bound while it is open. */
function onDocumentPointerDown(event) {
  if (!root.value?.contains(event.target)) close()
}

watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('pointerdown', onDocumentPointerDown)
  else document.removeEventListener('pointerdown', onDocumentPointerDown)
})

watch(() => route.fullPath, close)

onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))

async function signOut() {
  signingOut.value = true
  try {
    await auth.logout()
    close()
    emit('navigate')
    // Home rather than staying put: the current page may be one the visitor can
    // no longer see once they are signed out.
    router.push({ name: 'home' })
  } finally {
    signingOut.value = false
  }
}
</script>

<template>
  <div
    ref="root"
    class="gr-account"
    :class="stacked ? 'gr-account--stacked' : null"
  >
    <!-- Nothing is offered until the first sign-in state has arrived, so the
         header never flashes "Sign in" at somebody who is already signed in. -->
    <template v-if="!auth.ready">
      <span class="placeholder-glow" aria-hidden="true">
        <span class="placeholder rounded" style="width: 5rem; height: 1.5rem"></span>
      </span>
      <span class="visually-hidden" role="status">Checking your sign-in status…</span>
    </template>

    <template v-else-if="!auth.isAuthenticated">
      <RouterLink
        class="btn btn-outline-secondary btn-sm"
        :class="stacked ? 'w-100 mb-2' : null"
        :to="{ name: 'login', query: redirectQuery }"
        @click="emit('navigate')"
      >
        Sign in
      </RouterLink>
      <RouterLink
        class="btn btn-outline-primary btn-sm"
        :class="stacked ? 'w-100' : null"
        :to="{ name: 'register', query: redirectQuery }"
        @click="emit('navigate')"
      >
        Create account
      </RouterLink>
    </template>

    <template v-else-if="stacked">
      <div class="border-top pt-3 mt-2">
        <p class="mb-1 fw-semibold">{{ auth.displayName }}</p>
        <p v-if="roleLabel" class="small text-body-secondary mb-2">{{ roleLabel }}</p>
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm w-100"
          :disabled="signingOut"
          @click="signOut"
        >
          {{ signingOut ? 'Signing out…' : 'Sign out' }}
        </button>
      </div>
    </template>

    <template v-else>
      <button
        type="button"
        class="btn btn-sm gr-account__trigger"
        :aria-expanded="open"
        aria-haspopup="menu"
        @click="toggle"
        @keydown.esc="close"
      >
        <span class="gr-account__avatar" aria-hidden="true">{{ auth.initials }}</span>
        <span class="gr-account__name">{{ auth.displayName }}</span>
        <span class="visually-hidden">— account menu</span>
      </button>

      <div
        v-show="open"
        class="gr-account__menu shadow-sm"
        role="menu"
        @keydown.esc="close"
      >
        <p class="gr-account__meta mb-0">
          <span class="d-block fw-semibold text-truncate">{{ auth.displayName }}</span>
          <span class="d-block small text-body-secondary text-truncate">
            {{ auth.account?.email }}
          </span>
          <span v-if="roleLabel" class="badge text-bg-light mt-2">{{ roleLabel }}</span>
        </p>
        <hr class="my-2" />
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary w-100"
          role="menuitem"
          :disabled="signingOut"
          @click="signOut"
        >
          {{ signingOut ? 'Signing out…' : 'Sign out' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.gr-account {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  &--stacked {
    display: block;
  }

  &__trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    max-width: 12rem;
    border: 1px solid var(--bs-border-color);
    background: #fff;
  }

  &__avatar {
    flex: none;
    display: inline-grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    background: var(--gr-green-700, #2e7d32);
    color: #fff;
    font-size: 0.75rem;
    font-weight: 700;
  }

  &__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__menu {
    position: absolute;
    inset-inline-end: 0;
    top: calc(100% + 0.5rem);
    z-index: 1040;
    width: 15rem;
    padding: 0.75rem;
    border: 1px solid var(--bs-border-color);
    border-radius: 0.5rem;
    background: #fff;
  }

  &__meta {
    overflow: hidden;
  }
}
</style>
