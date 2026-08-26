<script setup>
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import { useBreakpoint } from '@/composables/useBreakpoint'

// Dev-only readout, so the active BR A.2 band can be seen while resizing.
const { bandLabel } = useBreakpoint()
const isDev = import.meta.env.DEV
</script>

<template>
  <a class="skip-link" href="#main-content">Skip to main content</a>

  <AppHeader />

  <main id="main-content" class="gr-page" tabindex="-1">
    <RouterView />
  </main>

  <AppFooter />

  <p v-if="isDev" class="gr-bp-badge" aria-hidden="true">{{ bandLabel }}</p>
</template>
