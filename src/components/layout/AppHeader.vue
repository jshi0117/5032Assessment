<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppNav from './AppNav.vue'

/**
 * Site header. Owns the mobile menu's open/closed state.
 *
 * The collapse is driven by Vue state rather than Bootstrap's JS bundle: it
 * keeps the behaviour inside the component tree, and means `aria-expanded` and
 * the visual state can never drift apart.
 */
const links = [
  { name: 'home', label: 'Home', to: { name: 'home' } },
  { name: 'events', label: 'Planting Events', to: { name: 'events' } },
  { name: 'volunteer', label: 'Volunteer', to: { name: 'volunteer' } }
]

const isOpen = ref(false)
const route = useRoute()

const toggle = () => { isOpen.value = !isOpen.value }
const close = () => { isOpen.value = false }

// Navigating on a phone should dismiss the drawer.
watch(() => route.fullPath, close)
</script>

<template>
  <header class="gr-header border-bottom bg-white sticky-top">
    <div class="gr-header__inner">
      <RouterLink :to="{ name: 'home' }" class="gr-brand" @click="close">
        <span class="gr-brand__mark" aria-hidden="true"></span>
        <span class="gr-brand__text">
          GreenRoots<span class="gr-brand__place"> Melbourne</span>
        </span>
      </RouterLink>

      <!-- Inline navigation, md and up -->
      <nav class="gr-header__desktop" aria-label="Primary">
        <AppNav :links="links" />
      </nav>

      <RouterLink
        :to="{ name: 'volunteer' }"
        class="btn btn-primary btn-sm gr-header__cta"
      >
        Join a planting day
      </RouterLink>

      <!-- Hamburger, below md -->
      <button
        type="button"
        class="btn btn-outline-secondary gr-header__toggle"
        :aria-expanded="isOpen"
        aria-controls="gr-mobile-nav"
        :aria-label="isOpen ? 'Close main menu' : 'Open main menu'"
        @click="toggle"
      >
        <span class="gr-burger" :class="{ 'gr-burger--open': isOpen }" aria-hidden="true">
          <span></span><span></span><span></span>
        </span>
      </button>
    </div>

    <!-- Mobile drawer -->
    <nav
      v-show="isOpen"
      id="gr-mobile-nav"
      class="gr-header__mobile border-top"
      aria-label="Primary, mobile"
    >
      <AppNav :links="links" stacked @navigate="close" />
      <RouterLink
        :to="{ name: 'volunteer' }"
        class="btn btn-primary w-100 mt-2"
        @click="close"
      >
        Join a planting day
      </RouterLink>
    </nav>
  </header>
</template>

<style scoped lang="scss">
@use '@/assets/styles/breakpoints' as bp;

.gr-header {
  z-index: 1030;

  &__inner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    max-width: var(--gr-container-max);
    margin-inline: auto;
    padding: 0.625rem 1rem;

    @include bp.up(sm) { padding-inline: 1.5rem; }
    @include bp.band-xxl { padding-inline: 2rem; }
  }

  // Inline nav appears from md up; below that the hamburger takes over.
  &__desktop {
    display: none;
    margin-inline-start: auto;

    @include bp.up(md) { display: block; }
  }

  &__cta {
    display: none;
    white-space: nowrap;

    // Only enough room for the call to action once the layout is roomy.
    @include bp.up(lg) { display: inline-flex; }
  }

  &__toggle {
    margin-inline-start: auto;
    padding: 0.375rem 0.5rem;
    line-height: 0;

    @include bp.up(md) { display: none; }
  }

  &__mobile {
    padding: 0.75rem 1rem 1rem;

    @include bp.up(md) { display: none; }
  }
}

.gr-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--gr-green-900);
  text-decoration: none;

  &__mark {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 0.375rem;
    background: linear-gradient(140deg, var(--gr-green-700), var(--gr-green-900));
    flex: none;
  }

  // The suburb drops away on the narrowest band so the brand never wraps.
  &__place {
    @include bp.band-xs { display: none; }
  }
}

.gr-burger {
  display: inline-block;
  width: 1.25rem;
  height: 1rem;
  position: relative;

  span {
    position: absolute;
    left: 0;
    width: 100%;
    height: 2px;
    border-radius: 2px;
    background: var(--gr-ink);
    transition: transform 0.2s ease, opacity 0.2s ease;

    &:nth-child(1) { top: 0; }
    &:nth-child(2) { top: 50%; transform: translateY(-50%); }
    &:nth-child(3) { bottom: 0; }
  }

  &--open span {
    &:nth-child(1) { top: 50%; transform: translateY(-50%) rotate(45deg); }
    &:nth-child(2) { opacity: 0; }
    &:nth-child(3) { bottom: 50%; transform: translateY(50%) rotate(-45deg); }
  }
}
</style>
