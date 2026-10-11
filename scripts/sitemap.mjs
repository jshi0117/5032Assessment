/**
 * Writes dist/sitemap.xml and dist/robots.txt after each build.
 *
 * Lists every public page, including one entry per published planting day, so
 * search engines and site-wide scanners (such as AccessibilityChecker.org's
 * full-domain audit, BR E.3) can find pages a single-page app only links to
 * from JavaScript. Drafts are left out, as are pages behind sign-in, which no
 * crawler can reach anyway.
 *
 * SITE_URL overrides the address for another deployment.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const SITE = (process.env.SITE_URL || 'https://project-5032assessment.web.app').replace(/\/$/, '')
const today = new Date().toISOString().slice(0, 10)

const events = JSON.parse(readFileSync(new URL('../src/data/events.json', import.meta.url), 'utf8'))

const pages = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/events', priority: '0.9', changefreq: 'daily' },
  { path: '/map', priority: '0.8', changefreq: 'weekly' },
  { path: '/volunteer', priority: '0.8', changefreq: 'monthly' },
  { path: '/developers', priority: '0.5', changefreq: 'monthly' },
  { path: '/login', priority: '0.3', changefreq: 'yearly' },
  { path: '/register', priority: '0.3', changefreq: 'yearly' },
  { path: '/forgot-password', priority: '0.2', changefreq: 'yearly' },
  ...events
    .filter((e) => e.status !== 'draft')
    .map((e) => ({ path: `/events/${e.id}`, priority: '0.6', changefreq: 'weekly' }))
]

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (p) => `  <url>
    <loc>${escape(SITE + p.path)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`

const robots = `User-agent: *
Allow: /
Disallow: /account
Disallow: /manage
Disallow: /admin
Disallow: /api/

Sitemap: ${SITE}/sitemap.xml
`

writeFileSync('dist/sitemap.xml', xml)
writeFileSync('dist/robots.txt', robots)
console.log(`sitemap: ${pages.length} pages → dist/sitemap.xml, dist/robots.txt`)
