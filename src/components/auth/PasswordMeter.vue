<script setup>
import { computed } from 'vue'
import { PASSWORD_LABELS, passwordScore } from '@/utils/validators'

/**
 * Strength feedback for a password field (BR C.1 / C.4).
 *
 * Guidance, not a gate — the rules in the form decide whether the value is
 * accepted. The score is announced as words as well as drawn as bars, because a
 * meter that only changes colour tells a screen reader user nothing.
 */
const props = defineProps({
  password: { type: String, default: '' }
})

const score = computed(() => passwordScore(props.password))
const label = computed(() => PASSWORD_LABELS[score.value])

const VARIANTS = ['bg-danger', 'bg-danger', 'bg-warning', 'bg-success', 'bg-success']
const variant = computed(() => VARIANTS[score.value])
</script>

<template>
  <div v-if="password" class="gr-meter mb-3">
    <div class="gr-meter__bars" aria-hidden="true">
      <span
        v-for="step in 4"
        :key="step"
        class="gr-meter__bar"
        :class="step <= score ? variant : 'bg-body-secondary'"
      ></span>
    </div>
    <p class="form-text mb-0" aria-live="polite">Password strength: {{ label }}</p>
  </div>
</template>

<style scoped lang="scss">
.gr-meter {
  margin-top: -0.5rem;

  &__bars {
    display: flex;
    gap: 0.25rem;
  }

  &__bar {
    flex: 1;
    height: 0.25rem;
    border-radius: 0.125rem;
  }
}
</style>
