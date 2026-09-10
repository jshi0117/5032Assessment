<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { useAuthStore } from '@/stores/authStore'
import { useEventStore } from '@/stores/eventStore'
import { formatRating, starsFor } from '@/utils/format'
import BaseAlert from '@/components/base/BaseAlert.vue'

/**
 * Rate a planting day, and see what everyone else made of it (BR C.3).
 *
 * The aggregate is the point, so it is shown to everybody — signed out, signed
 * in, rated or not. The control below it is what changes with who is looking.
 *
 * Scores are radio buttons rather than clickable star glyphs. A radio group is
 * a single stop in the tab order, arrow keys move between the options, and each
 * one has a real label, so the control works from the keyboard and reads
 * correctly to a screen reader without any of that being reimplemented.
 */
const props = defineProps({
  event: { type: Object, required: true }
})

const auth = useAuthStore()
const store = useEventStore()
const route = useRoute()

const saving = ref(false)
const error = ref(null)
const justSaved = ref(false)

const SCORES = [1, 2, 3, 4, 5]

const SCORE_LABELS = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very good',
  5: 'Excellent'
}

const myRating = computed(() => store.myRatingFor(props.event.id))

/**
 * Only a planting day that has happened can be rated. Scoring one that has not
 * taken place yet would be scoring an intention, and it would let the average
 * be moved by people who never turned up.
 */
const isRateable = computed(() => props.event.isPast && props.event.status !== 'cancelled')

const unavailableReason = computed(() => {
  if (props.event.status === 'cancelled') return 'This planting day was cancelled, so there is nothing to rate.'
  if (!props.event.isPast) return 'You can rate this planting day once it has taken place.'
  return null
})

/** The distribution, as a percentage of the largest bar. */
const distribution = computed(() => {
  const buckets = props.event.ratingBuckets ?? [0, 0, 0, 0, 0]
  const highest = Math.max(...buckets, 1)
  return SCORES.map((score) => ({
    score,
    count: buckets[score - 1],
    percent: Math.round((buckets[score - 1] / highest) * 100)
  })).reverse()
})

/** True once anyone has rated through the application, seed figures aside. */
const hasDistribution = computed(() => (props.event.ratedHere ?? 0) > 0)

/** Sends the visitor back here after signing in. */
const signInTarget = computed(() => ({
  name: 'login',
  query: { redirect: route.fullPath }
}))

async function load() {
  if (!auth.account?.uid) return
  try {
    await store.loadMyRating(props.event.id, auth.account.uid)
  } catch {
    // A failure to read the user's own previous score is not worth an error
    // banner: the control still works, it simply starts with nothing selected.
  }
}

onMounted(load)

// Signing in or out mid-visit changes whose rating this is.
watch(() => auth.account?.uid, (uid) => {
  justSaved.value = false
  error.value = null
  if (uid) load()
  else store.clearMyRatings()
})

async function choose(score) {
  if (saving.value || score === myRating.value) return
  saving.value = true
  error.value = null
  justSaved.value = false
  try {
    await store.rate(props.event.id, auth.account.uid, score)
    justSaved.value = true
  } catch (err) {
    error.value = err?.message ?? 'Your rating could not be saved. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="card">
    <div class="card-body">
      <h2 class="h6 mb-3">Volunteer rating</h2>

      <template v-if="event.ratingCount">
        <p class="mb-1">
          <span class="h4 gr-rating__stars" aria-hidden="true">
            {{ '★'.repeat(starsFor(event.averageRating)).padEnd(5, '☆') }}
          </span>
          <span class="ms-2 align-middle">{{ formatRating(event.averageRating) }} / 5</span>
        </p>
        <p class="small text-body-secondary">
          Average of {{ event.ratingCount }}
          {{ event.ratingCount === 1 ? 'rating' : 'ratings' }}
        </p>

        <ul v-if="hasDistribution" class="list-unstyled small mb-3">
          <li
            v-for="row in distribution"
            :key="row.score"
            class="d-flex align-items-center gap-2"
          >
            <span class="gr-rating__key text-nowrap">{{ row.score }} ★</span>
            <span class="gr-rating__track">
              <span class="gr-rating__bar" :style="{ width: `${row.percent}%` }"></span>
            </span>
            <span class="gr-rating__count text-body-secondary text-end">{{ row.count }}</span>
          </li>
        </ul>
      </template>

      <p v-else class="small text-body-secondary">
        No ratings yet.
        <template v-if="isRateable">Yours would be the first.</template>
      </p>

      <hr />

      <!-- Signed out: the aggregate above is still visible; only rating is gated. -->
      <p v-if="!auth.isAuthenticated" class="small mb-0">
        <RouterLink :to="signInTarget">Sign in</RouterLink>
        to rate this planting day.
      </p>

      <p v-else-if="!isRateable" class="small text-body-secondary mb-0">
        {{ unavailableReason }}
      </p>

      <template v-else>
        <BaseAlert v-if="error" variant="danger">{{ error }}</BaseAlert>

        <fieldset :disabled="saving">
          <legend class="form-label mb-2">
            {{ myRating ? 'Your rating' : 'Rate this planting day' }}
          </legend>

          <div class="gr-rating__choices" role="radiogroup">
            <template v-for="score in SCORES" :key="score">
              <input
                :id="`rating-${event.id}-${score}`"
                class="visually-hidden gr-rating__input"
                type="radio"
                :name="`rating-${event.id}`"
                :value="score"
                :checked="myRating === score"
                @change="choose(score)"
              />
              <label
                class="gr-rating__star"
                :class="{ 'gr-rating__star--on': myRating !== null && score <= myRating }"
                :for="`rating-${event.id}-${score}`"
              >
                <span aria-hidden="true">★</span>
                <span class="visually-hidden">
                  {{ score }} out of 5 — {{ SCORE_LABELS[score] }}
                </span>
              </label>
            </template>
          </div>

          <!-- One live region for every outcome, so a screen reader hears the
               result of choosing a score rather than only seeing it. -->
          <p class="small mb-0 mt-2" role="status">
            <template v-if="saving">Saving your rating…</template>
            <template v-else-if="justSaved">
              Thanks — your rating of {{ myRating }} out of 5 was saved. You can
              change it at any time.
            </template>
            <template v-else-if="myRating">
              You rated this {{ myRating }} out of 5 ({{ SCORE_LABELS[myRating] }}).
            </template>
            <template v-else>Choose a score from 1 to 5.</template>
          </p>
        </fieldset>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.gr-rating {
  &__stars {
    letter-spacing: 0.1em;
    color: var(--gr-green-700, #2e7d32);
  }

  &__key {
    width: 2.5rem;
  }

  &__count {
    width: 2rem;
  }

  &__track {
    flex: 1;
    height: 0.5rem;
    border-radius: 0.25rem;
    background: var(--bs-secondary-bg, #e9ecef);
    overflow: hidden;
  }

  &__bar {
    display: block;
    height: 100%;
    background: var(--gr-green-700, #2e7d32);
  }

  &__choices {
    display: flex;
    gap: 0.25rem;
  }

  &__star {
    cursor: pointer;
    font-size: 1.75rem;
    line-height: 1;
    color: var(--bs-secondary-color, #6c757d);
    transition: color 0.15s ease, transform 0.15s ease;

    &--on {
      color: var(--gr-green-700, #2e7d32);
    }

    &:hover {
      transform: scale(1.1);
    }
  }

  // The radio itself is hidden, so its focus ring has to be drawn on the label
  // instead — otherwise the control is invisible to keyboard users.
  &__input:focus-visible + &__star {
    outline: 2px solid var(--bs-focus-ring-color, #0d6efd);
    outline-offset: 2px;
    border-radius: 0.25rem;
  }
}

fieldset:disabled .gr-rating__star {
  cursor: progress;
  opacity: 0.6;
}
</style>
