import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

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
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
