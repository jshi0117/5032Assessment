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
    path: '/manage',
    name: 'manage',
    component: () => import('@/views/manage/ManageEventsView.vue'),
    // Both roles reach the page; what they see differs. The view narrows an
    // administrator to everything and a coordinator to their own planting days.
    meta: { title: 'Manage planting days', requiresAuth: true, roles: ['coordinator', 'admin'] }
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('@/views/admin/AdminDashboardView.vue'),
    meta: { title: 'Administrator overview', requiresAuth: true, roles: ['admin'] }
  },
  {
    path: '/admin/users',
    name: 'admin-users',
    component: () => import('@/views/admin/AdminUsersView.vue'),
    meta: { title: 'Accounts', requiresAuth: true, roles: ['admin'] }
  },
  {
    path: '/forbidden',
    name: 'forbidden',
    component: () => import('@/views/ForbiddenView.vue'),
    meta: { title: 'Access denied' }
  },
  {
    path: '/account',
    name: 'account',
    component: () => import('@/views/auth/AccountView.vue'),
    meta: { title: 'Your account', requiresAuth: true }
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
 * Three rules, in order: pages that need an account, pages that need a
 * particular role, and pages that only make sense signed out.
 *
 * This guard is a convenience, not the security boundary. It governs one
 * browser tab and nothing else — anyone can call the same Firestore operations
 * from a console. What actually refuses an unauthorised write is the security
 * rules; this exists so a legitimate user is not shown a page they cannot use.
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

  // `redirect` carries the intended page, so signing in lands the visitor where
  // they were going rather than dropping them on the home page.
  if (to.meta?.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // Signed in, but not as somebody this page is for. Answered with an
  // explanation rather than a bounce to the home page, which would look like
  // the link was broken. `from` and `needs` let that page say what was missing.
  if (to.meta?.roles && !auth.hasRole(to.meta.roles)) {
    return {
      name: 'forbidden',
      query: { from: to.fullPath, needs: to.meta.roles.join(',') }
    }
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
