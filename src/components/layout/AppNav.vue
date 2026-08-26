<script setup>
/**
 * The site's primary navigation links.
 *
 * Purely presentational: it receives the link list and reports clicks upwards
 * so AppHeader can close the mobile menu. It owns no state of its own.
 */
defineProps({
  links: {
    type: Array,
    required: true
  },
  /** Stack vertically (mobile drawer) instead of inline. */
  stacked: {
    type: Boolean,
    default: false
  }
})

defineEmits(['navigate'])
</script>

<template>
  <ul
    class="navbar-nav gr-nav mb-0"
    :class="stacked ? 'flex-column py-2' : 'flex-row align-items-center gap-1'"
  >
    <li v-for="link in links" :key="link.name" class="nav-item">
      <RouterLink
        class="nav-link px-3"
        :to="link.to"
        @click="$emit('navigate')"
      >
        {{ link.label }}
      </RouterLink>
    </li>
  </ul>
</template>

<style scoped lang="scss">
.gr-nav :deep(.nav-link) {
  color: var(--gr-ink);
  border-radius: 0.375rem;
  font-weight: 500;

  &:hover {
    color: var(--gr-green-900);
    background-color: var(--gr-green-100);
  }

  // RouterLink adds this class to the link matching the current route.
  &.router-link-active {
    color: var(--gr-green-900);
    background-color: var(--gr-green-100);
    font-weight: 600;
  }
}
</style>
