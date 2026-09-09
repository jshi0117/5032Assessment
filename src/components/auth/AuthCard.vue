<script setup>
/**
 * The shell every authentication screen sits in.
 *
 * Layout only — it owns no state. Keeping it here means sign-in, registration
 * and password reset stay visually identical without repeating the markup, and
 * the heading is a real <h1> on each so the page has one.
 */
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: null }
})
</script>

<template>
  <div class="gr-auth">
    <div class="card shadow-sm gr-auth__card">
      <div class="card-body p-4 p-sm-5">
        <h1 class="h4 mb-1">{{ title }}</h1>
        <p v-if="subtitle" class="text-body-secondary small mb-4">{{ subtitle }}</p>
        <slot />
      </div>
    </div>
    <p v-if="$slots.footer" class="text-center small mt-3 mb-0">
      <slot name="footer" />
    </p>
  </div>
</template>

<style scoped lang="scss">
.gr-auth {
  width: 100%;
  max-width: 30rem;
  margin-inline: auto;
  padding-block: 2.5rem 4rem;

  &__card {
    border: 0;
  }
}
</style>
