import { copyFile } from 'node:fs/promises'

/**
 * GitHub Pages has no rewrite rules — it serves 404.html for any path with no
 * matching file. Shipping a copy of index.html under that name makes a deep
 * link such as /events/evt-010 load the app instead of GitHub's 404 page; the
 * router then resolves the path on the client.
 *
 * Hosts that do support rewrites (Cloudflare Pages, Netlify) use public/_redirects
 * instead and simply ignore this file.
 */
await copyFile('dist/index.html', 'dist/404.html')
console.log('spa-fallback: dist/404.html written')
