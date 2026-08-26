<script setup>
/**
 * Landing page.
 *
 * TODO: the figures and cards below are static placeholders, present only so
 * the responsive grid has real content to reflow. They must be replaced with
 * data read through `eventStore` -> `eventService` before this page counts
 * towards BR B.2, which explicitly penalises hard-coded values.
 */
const impact = [
  { value: '12,480', label: 'Trees planted since 2019' },
  { value: '38', label: 'Planting sites restored' },
  { value: '1,260', label: 'Volunteers registered' },
  { value: '64', label: 'Indigenous species propagated' }
]

const highlights = [
  {
    id: 'placeholder-1',
    title: 'Kororoit Creek planting day',
    suburb: 'Sunshine',
    date: 'Saturday 12 September',
    blurb: 'Riparian planting along the creek bank. Family friendly, tools provided.'
  },
  {
    id: 'placeholder-2',
    title: 'Ardeer Reserve planting day',
    suburb: 'Ardeer',
    date: 'Saturday 26 September',
    blurb: 'Establishing a native understorey beneath the existing river red gums.'
  },
  {
    id: 'placeholder-3',
    title: 'Braybrook Park planting day',
    suburb: 'Braybrook',
    date: 'Saturday 10 October',
    blurb: 'Shade-tree planting to cool one of the hottest streets in the west.'
  }
]
</script>

<template>
  <!-- Hero -->
  <section class="gr-hero rounded-4 p-4 p-lg-5 mb-4 mb-lg-5">
    <div class="row align-items-center g-4">
      <div class="col-12 col-lg-7">
        <p class="text-uppercase fw-semibold small mb-2 gr-hero__eyebrow">
          Melbourne's west &amp; north
        </p>
        <h1 class="display-6 fw-bold mb-3">
          Grow a cooler, greener neighbourhood
        </h1>
        <p class="lead mb-4">
          GreenRoots Melbourne plants indigenous trees with the communities that
          need shade the most — suburbs where canopy cover sits below ten per cent.
        </p>
        <div class="d-flex flex-column flex-sm-row gap-2">
          <RouterLink :to="{ name: 'volunteer' }" class="btn btn-primary btn-lg">
            Join a planting day
          </RouterLink>
          <RouterLink :to="{ name: 'events' }" class="btn btn-outline-primary btn-lg">
            See upcoming events
          </RouterLink>
        </div>
      </div>
      <div class="col-12 col-lg-5">
        <div class="gr-hero__panel rounded-4 p-4">
          <p class="fw-semibold mb-1">Next planting day</p>
          <p class="h5 mb-1">Saturday 12 September, 9:00am</p>
          <p class="text-body-secondary mb-0">Kororoit Creek, Sunshine</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Impact figures: 2-up on phones, 4-up once there is room -->
  <section class="mb-4 mb-lg-5" aria-labelledby="impact-heading">
    <h2 id="impact-heading" class="h4 mb-3">Our impact so far</h2>
    <div class="row g-3">
      <div v-for="item in impact" :key="item.label" class="col-6 col-lg-3">
        <div class="card h-100 border-0 gr-stat">
          <div class="card-body">
            <p class="h3 mb-1 gr-stat__value">{{ item.value }}</p>
            <p class="small text-body-secondary mb-0">{{ item.label }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Highlighted events: 1 / 2 / 3 / 4 across the graded bands -->
  <section aria-labelledby="upcoming-heading">
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
      <h2 id="upcoming-heading" class="h4 mb-0">Upcoming planting days</h2>
      <RouterLink :to="{ name: 'events' }" class="small">View all events</RouterLink>
    </div>

    <div class="row g-3 g-lg-4">
      <div
        v-for="event in highlights"
        :key="event.id"
        class="col-12 col-sm-6 col-lg-4 col-xxl-3"
      >
        <article class="card h-100">
          <div class="card-body d-flex flex-column">
            <p class="badge text-bg-light align-self-start mb-2">{{ event.suburb }}</p>
            <h3 class="h6 card-title">{{ event.title }}</h3>
            <p class="small text-body-secondary mb-2">{{ event.date }}</p>
            <p class="small mb-3">{{ event.blurb }}</p>
            <RouterLink
              :to="{ name: 'events' }"
              class="btn btn-sm btn-outline-primary mt-auto align-self-start"
            >
              Details
            </RouterLink>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '@/assets/styles/breakpoints' as bp;

.gr-hero {
  background: linear-gradient(150deg, var(--gr-green-100), #ffffff 70%);
  border: 1px solid rgba(46, 125, 50, 0.15);

  &__eyebrow { color: var(--gr-green-700); letter-spacing: 0.06em; }

  &__panel {
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.08);
  }

  // Tighten the hero on the smallest band so the buttons stay above the fold.
  @include bp.band-xs {
    .display-6 { font-size: 1.75rem; }
    .lead { font-size: 1rem; }
  }
}

.gr-stat {
  background: var(--gr-green-100);

  &__value { color: var(--gr-green-900); }
}
</style>
