<script setup>
const year = new Date().getFullYear()

const columns = [
  {
    heading: 'GreenRoots',
    links: [
      { label: 'Home', to: { name: 'home' } },
      { label: 'Planting Events', to: { name: 'events' } },
      { label: 'Volunteer', to: { name: 'volunteer' } }
    ]
  }
]
</script>

<template>
  <footer class="gr-footer mt-auto border-top bg-light">
    <div class="gr-footer__inner">
      <div class="row g-4">
        <div class="col-12 col-sm-8 col-lg-9">
          <p class="fw-bold mb-2">GreenRoots Melbourne</p>
          <p class="text-body-secondary small mb-0">
            Community tree-planting and native-species regeneration across
            Melbourne's western and northern suburbs.
          </p>
        </div>

        <div
          v-for="column in columns"
          :key="column.heading"
          class="col-12 col-sm-4 col-lg-3"
        >
          <p class="fw-semibold small text-uppercase text-body-secondary mb-2">
            {{ column.heading }}
          </p>
          <ul class="list-unstyled small mb-0">
            <li v-for="link in column.links" :key="link.label" class="mb-1">
              <RouterLink class="link-secondary text-decoration-none" :to="link.to">
                {{ link.label }}
              </RouterLink>
            </li>
          </ul>
        </div>
      </div>

      <hr class="my-4" />

      <p class="small text-body-secondary mb-0">
        &copy; {{ year }} GreenRoots Melbourne. Built as coursework for FIT5032.
      </p>
    </div>
  </footer>
</template>

<style scoped lang="scss">
@use '@/assets/styles/breakpoints' as bp;

.gr-footer__inner {
  width: 100%;
  max-width: 1320px;
  margin-inline: auto;
  padding: 2rem 1rem 1.5rem;

  @include bp.up(sm) { padding-inline: 1.5rem; }
  @include bp.band-xxl { padding-inline: 2rem; }
}
</style>
