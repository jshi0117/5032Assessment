import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

/**
 * Content Security Policy (BR C.4).
 *
 * The second line of defence against cross-site scripting. Vue escapes what it
 * renders, so an injected `<script>` should never reach the parser in the first
 * place; this is what limits the damage if one ever does — an injected script
 * has nowhere to load from and nowhere to send what it steals.
 *
 * Delivered as a `<meta>` tag because the app is a static bundle with no server
 * of its own to set headers. Two consequences worth knowing:
 *
 *   - `frame-ancestors` and `report-uri` are ignored in a meta policy. To stop
 *     this site being framed, the host has to send the header itself —
 *     Cloudflare Pages and Netlify both do this from `_headers`.
 *   - The policy applies from the point the tag is parsed, so it sits before
 *     any script in <head>.
 *
 * Built here rather than hand-written into index.html so that development can
 * have what it needs — Vite's HMR socket, its injected styles — without those
 * allowances shipping to production.
 */
function contentSecurityPolicy(isDev) {
  const directives = {
    'default-src': ["'self'"],

    // No CDN: everything is bundled. Vue's runtime build compiles no templates
    // at runtime, so 'unsafe-eval' is not needed even in development.
    'script-src': ["'self'"],

    // Vue writes scoped styles into <style> tags, and `:style` bindings become
    // inline style attributes; both need 'unsafe-inline'. This is the one
    // relaxation in the policy, and it is a much smaller exposure than the
    // script equivalent — a style cannot execute.
    'style-src': ["'self'", "'unsafe-inline'"],

    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'", 'data:'],

    // Where the application is allowed to talk to. Firebase Authentication and
    // Firestore, and nothing else — an injected script cannot post what it
    // finds to an address that is not on this list.
    'connect-src': [
      "'self'",
      'https://identitytoolkit.googleapis.com',
      'https://securetoken.googleapis.com',
      'https://firestore.googleapis.com'
    ],

    // Nothing here is embedded, and nothing here embeds anything.
    'object-src': ["'none'"],
    'frame-src': ["'none'"],

    // Stops an injected <base> tag from re-pointing every relative URL on the
    // page, and stops a form being retargeted at somebody else's server.
    'base-uri': ["'self'"],
    'form-action': ["'self'"]
  }

  if (isDev) {
    // Vite's dev client opens a WebSocket for hot reload and serves modules
    // over http; neither exists in the built output.
    directives['connect-src'].push('ws:', 'wss:', 'http://localhost:*')
    directives['script-src'].push("'unsafe-inline'")
  }

  return Object.entries(directives)
    .map(([directive, values]) => `${directive} ${values.join(' ')}`)
    .join('; ')
}

/** Injects the policy as the first thing in <head>. */
function cspPlugin() {
  return {
    name: 'greenroots-csp',
    transformIndexHtml(html, context) {
      const policy = contentSecurityPolicy(Boolean(context.server))
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
            injectTo: 'head-prepend'
          }
        ]
      }
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  /*
   * Root by default, which suits Cloudflare Pages, Netlify and Firebase
   * Hosting. GitHub Pages serves a project site from a sub-path, so build it
   * with the repository name:
   *
   *   VITE_BASE=/5032Assessment/ npm run build
   *
   * Without this the built asset URLs point at the domain root and the
   * deployed page loads blank.
   */
  base: process.env.VITE_BASE || '/',

  plugins: [
    vue(),
    vueDevTools(),
    cspPlugin(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
