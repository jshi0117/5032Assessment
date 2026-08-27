<script setup>
import { ref } from 'vue'

import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useEventStore } from '@/stores/eventStore'

/*
 * Development aids. Stripped from a production build by the import.meta.env.DEV
 * guard, which Vite resolves to false at build time.
 *
 *  - the band readout makes the active BR A.2 breakpoint visible while resizing
 *  - the reset drops local registrations and ratings back to the seed data, so
 *    a demo can be run repeatedly without opening the console
 */
const isDev = import.meta.env.DEV
const { bandLabel } = useBreakpoint()

const store = useEventStore()
const resetting = ref(false)

async function resetDemoData() {
  resetting.value = true
  try {
    await store.resetLocalChanges()
  } finally {
    resetting.value = false
  }
}
</script>

<template>
  <a class="skip-link" href="#main-content">Skip to main content</a>

  <AppHeader />

  <main id="main-content" class="gr-page" tabindex="-1">
    <RouterView />
  </main>

  <AppFooter />

  <!--
    Hidden from assistive technology because it is not part of the product, and
    taken out of the tab order to match: aria-hidden around a focusable control
    is the "aria-hidden-focus" violation — a keyboard user reaches a button a
    screen reader cannot announce.
  -->
  <div v-if="isDev" class="gr-devbar" aria-hidden="true">
    <button
      type="button"
      class="gr-devbar__button"
      tabindex="-1"
      :disabled="resetting"
      title="Clear local registrations and ratings, back to the seed data"
      @click="resetDemoData"
    >
      {{ resetting ? 'Resetting…' : 'Reset demo data' }}
    </button>
    <span class="gr-devbar__badge">{{ bandLabel }}</span>
  </div>
</template>
