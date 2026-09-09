import { createRouter, createWebHistory } from 'vue-router'

import HomeView from '@/views/HomeView.vue'
import { useAuthStore } from '@/stores/authStore'

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
    path: '/login',
    name: 'login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { title: 'Sign in', guestOnly: true }
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/auth/RegisterView.vue'),
    meta: { title: 'Create an account', guestOnly: true }
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('@/views/auth/ForgotPasswordView.vue'),
    meta: { title: 'Reset your password', guestOnly: true }
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
 * Sign-in state gate.
 *
 * Every guarded navigation waits on `whenReady()` first. Firebase restores a
 * session asynchronously, so immediately after a reload the client cannot yet
 * tell a signed-in user from a visitor; deciding then would sign people out of
 * their own bookmarks on every refresh.
 *
 * Only the guest-only rule lives here for now. The role checks BR C.2 adds hang
 * off `meta.roles` in this same hook.
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.whenReady()

  // Someone already signed in has no use for the sign-in or registration pages;
  // send them on rather than showing a form that cannot apply to them.
  if (to.meta?.guestOnly && auth.isAuthenticated) {
    const target = to.query.redirect
    return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')
      ? target
      : { name: 'home' }
  }

  return true
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
