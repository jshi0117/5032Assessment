import { createRouter, createWebHistory } from 'vue-router'

import HomeView from '@/views/HomeView.vue'

/**
 * Route table.
 *
 * `meta` is already in place for the guards that BR C.2 will add: routes are
 * public unless a `meta.roles` array says otherwise, so adding authorisation
 * later is a matter of registering `beforeEach` in this file — no route needs
 * restructuring.
 */
const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
    meta: { title: 'Home' }
  },
  {
    path: '/events',
    name: 'events',
    // Lazily loaded: keeps the initial bundle to the landing page only.
    component: () => import('@/views/EventsView.vue'),
    meta: { title: 'Planting Events' }
  },
  {
    path: '/events/:id',
    name: 'event-detail',
    component: () => import('@/views/EventDetailView.vue'),
    props: true,
    meta: { title: 'Event details' }
  },
  {
    path: '/volunteer',
    name: 'volunteer',
    component: () => import('@/views/VolunteerSignupView.vue'),
    meta: { title: 'Volunteer sign-up' }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: 'Page not found' }
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    return savedPosition ?? { top: 0 }
  }
})

/**
 * Keeps the document title in step with the route, and moves focus to the new
 * page.
 *
 * A single-page navigation swaps the content but leaves focus on the link that
 * was clicked, so a keyboard or screen reader user stays put while the page
 * changes around them. Sending focus to <main> — which carries tabindex="-1" so
 * it can receive focus without joining the tab order — puts them at the top of
 * the new content. Skipped on first load, where focus is already correct.
 */
let isFirstNavigation = true

router.afterEach((to) => {
  document.title = to.meta?.title
    ? `${to.meta.title} · GreenRoots Melbourne`
    : 'GreenRoots Melbourne'

  if (isFirstNavigation) {
    isFirstNavigation = false
    return
  }

  // After the DOM has been swapped for the new route.
  requestAnimationFrame(() => {
    document.getElementById('main-content')?.focus()
  })
})

export default router
