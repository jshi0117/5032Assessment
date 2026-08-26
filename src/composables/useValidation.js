/**
 * Runs a rule schema against a set of values.
 *
 * A schema maps a field name to an ordered list of rules from
 * `@/utils/validators`. Rules run in order and the first failure wins, so a
 * field reports one message at a time rather than a wall of them.
 *
 * Deliberately stateless: it holds no refs, which is what lets the same schema
 * be reused by a form component, by a store action before it writes, and by a
 * server-side check later.
 */
export function useValidation(schema = {}) {
  const fields = Object.keys(schema)

  /** First failing message for one field, or null. */
  function validateField(name, values = {}) {
    const rules = schema[name] ?? []
    for (const rule of rules) {
      const message = rule(values[name], values)
      if (message) return message
    }
    return null
  }

  /** `{ fieldName: message }` for every failing field. Empty object when valid. */
  function validateAll(values = {}) {
    const errors = {}
    for (const name of fields) {
      const message = validateField(name, values)
      if (message) errors[name] = message
    }
    return errors
  }

  const isValid = (values = {}) => Object.keys(validateAll(values)).length === 0

  /**
   * Fields that must be re-checked when `name` changes.
   *
   * A confirm-password field depends on the password field, so editing the
   * password has to restore or clear the confirm field's error too. The link is
   * read from the rule's own `dependsOn`, which cross-field validators declare;
   * inferring it from the rule's source text does not work, because the field
   * name lives in a closure variable rather than in the function body.
   */
  function dependentsOf(name) {
    return fields.filter(
      (field) =>
        field !== name &&
        (schema[field] ?? []).some((rule) => rule.dependsOn?.includes(name))
    )
  }

  return { fields, validateField, validateAll, isValid, dependentsOf }
}
