/**
 * Validation rules (BR B.1).
 *
 * Each factory returns a rule: `(value, allValues) => string | null`, where a
 * string is the message shown to the user and null means the value passed.
 * They are plain functions with no Vue dependency, so the same rules run in a
 * component, in a store action before a write, and later inside a cloud
 * function — one definition, three layers.
 */

const isEmpty = (value) =>
  value === null ||
  value === undefined ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0)

/** Type 1 — presence. */
export const required =
  (label = 'This field') =>
  (value) =>
    isEmpty(value) ? `${label} is required.` : null

/** Type 2 — format. Deliberately permissive; the definitive check is delivery. */
export const email =
  (label = 'Email address') =>
  (value) =>
    isEmpty(value) || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value).trim())
      ? null
      : `Enter a valid ${label.toLowerCase()}, for example name@example.com.`

/** Type 2 — format, localised. Australian mobiles are 04 followed by 8 digits. */
export const auMobile =
  (label = 'Mobile number') =>
  (value) => {
    if (isEmpty(value)) return null
    const digits = String(value).replace(/[\s-]/g, '')
    return /^04\d{8}$/.test(digits)
      ? null
      : `${label} must be an Australian mobile starting with 04, for example 0412 345 678.`
  }

/** Type 3 — length. */
export const minLength =
  (min, label = 'This field') =>
  (value) =>
    isEmpty(value) || String(value).length >= min
      ? null
      : `${label} must be at least ${min} characters.`

export const maxLength =
  (max, label = 'This field') =>
  (value) =>
    isEmpty(value) || String(value).length <= max
      ? null
      : `${label} must be ${max} characters or fewer.`

/** Type 3 — composition. */
export const hasNumber =
  (label = 'Password') =>
  (value) =>
    isEmpty(value) || /\d/.test(String(value))
      ? null
      : `${label} must include at least one number.`

/** Type 4 — numeric range. */
export const numberRange =
  (min, max, label = 'This field') =>
  (value) => {
    if (isEmpty(value)) return null
    const n = Number(value)
    if (Number.isNaN(n)) return `${label} must be a number.`
    if (!Number.isInteger(n)) return `${label} must be a whole number.`
    if (n < min || n > max) return `${label} must be between ${min} and ${max}.`
    return null
  }

/**
 * Type 4 — range with a ceiling only known at runtime.
 * `getMax` is read at validation time, so it tracks a changing value such as
 * the places left on a planting day.
 */
export const atMost =
  (getMax, label = 'This field') =>
  (value) => {
    if (isEmpty(value)) return null
    const max = typeof getMax === 'function' ? getMax() : getMax
    return Number(value) <= max
      ? null
      : `Only ${max} ${max === 1 ? 'place is' : 'places are'} left, so ${label.toLowerCase()} cannot be more than ${max}.`
  }

/**
 * Attaches the fields a rule reads besides its own, so the form knows to
 * re-check this field when one of them changes. Declared explicitly rather than
 * inferred: a rule's source text does not reveal which field it closes over.
 */
const dependsOn = (rule, fields) => Object.assign(rule, { dependsOn: fields })

/** Type 5 — cross-field. */
export const matches = (otherField, label = 'This field', otherLabel = 'the other field') =>
  dependsOn(
    (value, allValues = {}) =>
      isEmpty(value) || value === allValues[otherField]
        ? null
        : `${label} must match ${otherLabel}.`,
    [otherField]
  )

/** Type 5 — cross-field ordering, for date ranges. */
export const notBefore = (otherField, label = 'End date', otherLabel = 'start date') =>
  dependsOn(
    (value, allValues = {}) =>
      isEmpty(value) || isEmpty(allValues[otherField]) || value >= allValues[otherField]
        ? null
        : `${label} cannot be earlier than the ${otherLabel}.`,
    [otherField]
  )

/** Checkboxes that must be ticked, such as a code of conduct. */
export const accepted =
  (message = 'You need to agree before continuing.') =>
  (value) =>
    value === true ? null : message

export const oneOf =
  (allowed, label = 'This field') =>
  (value) =>
    isEmpty(value) || allowed.includes(value)
      ? null
      : `${label} must be one of: ${allowed.join(', ')}.`

/**
 * Password strength as a 0-4 score, for the meter beside the field.
 * Separate from the pass/fail rules: the meter guides, the rules gate.
 */
export function passwordScore(value) {
  const password = String(value ?? '')
  if (!password) return 0
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/\d/.test(password) && /[a-zA-Z]/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++
  return Math.min(score, 4)
}

export const PASSWORD_LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong']
