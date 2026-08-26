<script setup>
</script>

<template>
  <section class="text-center py-5">
    <p class="display-6 fw-bold mb-2">404</p>
    <h1 class="h4 mb-3">We couldn't find that page</h1>
    <p class="text-body-secondary mb-4">
      The page may have moved, or the link may be out of date.
    </p>
    <RouterLink :to="{ name: 'home' }" class="btn btn-primary">
      Back to home
    </RouterLink>
  </section>
</template>
