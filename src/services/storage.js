/**
 * Thin wrapper around localStorage.
 *
 * Every read and write is guarded: `getItem` returns corrupt JSON if the user
 * has hand-edited it, and `setItem` throws outright in private browsing and
 * when the origin's quota is exhausted. A storage failure must degrade to
 * "this change was not persisted", never take the page down.
 */
const PREFIX = 'greenroots:'

const key = (name) => `${PREFIX}${name}`

/** Returns the stored value, or `fallback` if it is missing or unreadable. */
export function read(name, fallback = null) {
  try {
    const raw = window.localStorage.getItem(key(name))
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

/** Returns true when the value was persisted. */
export function write(name, value) {
  try {
    window.localStorage.setItem(key(name), JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function remove(name) {
  try {
    window.localStorage.removeItem(key(name))
    return true
  } catch {
    return false
  }
}

/** Clears only this application's keys, leaving the rest of the origin alone. */
export function clearAll() {
  try {
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => window.localStorage.removeItem(k))
    return true
  } catch {
    return false
  }
}

/** True when localStorage is usable at all — drives the offline notice later. */
export function isAvailable() {
  try {
    const probe = key('__probe__')
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}
