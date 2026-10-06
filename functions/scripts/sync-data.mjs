/**
 * Copies the planting-day seed data into the functions package.
 *
 * Cloud Functions deploys only this folder, so it cannot read ../src/data at
 * run time. Copying (rather than keeping a second hand-edited copy) means the
 * web app's JSON stays the single source of truth; firebase.json runs this
 * before every deploy and `npm run serve` before every emulator start.
 *
 * The email function reads events from here and never from the request, so a
 * caller cannot put arbitrary text into an email by inventing an event.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const from = resolve(here, '../../src/data')
const to = resolve(here, '../src/data')

mkdirSync(to, { recursive: true })
for (const file of ['events.json', 'sites.json']) {
  copyFileSync(resolve(from, file), resolve(to, file))
  console.log(`sync-data: ${file}`)
}
