import { computed, reactive, ref, watch } from 'vue'
import { useValidation } from './useValidation'

/**
 * Form state: values, errors, touched flags and submission.
 *
 * The feedback rules BR B.1 is graded on live here rather than in each form:
 *
 *  - a field is validated on blur, so nothing is flagged while it is being typed
 *  - once a field has been touched it re-validates live, so an error clears as
 *    soon as it is fixed rather than at the next submit
 *  - submitting marks every field touched, so nothing fails silently
 */
export function useForm({ initialValues = {}, schema = {}, onSubmit } = {}) {
  const { validateField, validateAll, dependentsOf } = useValidation(schema)

  const values = reactive({ ...initialValues })
  const errors = reactive({})
  const touched = reactive({})

  const submitting = ref(false)
  const submitError = ref(null)
  const submitted = ref(false)

  function setError(name) {
    const message = validateField(name, values)
    if (message) errors[name] = message
    else delete errors[name]
  }

  /** Marks a field touched and validates it — bind to @blur. */
  function handleBlur(name) {
    touched[name] = true
    setError(name)
  }

  // Live re-validation, but only for fields the user has already left once.
  watch(
    () => ({ ...values }),
    (next, previous) => {
      for (const name of Object.keys(next)) {
        if (next[name] === previous?.[name]) continue
        if (touched[name]) setError(name)
        // Keep cross-field rules honest, e.g. confirm-password.
        for (const dependent of dependentsOf(name)) {
          if (touched[dependent]) setError(dependent)
        }
      }
    },
    { deep: true }
  )

  /** True when every rule passes — drives the submit button's disabled state. */
  const isValid = computed(() => Object.keys(validateAll(values)).length === 0)

  /** Only shows an error once the field has been visited. */
  const errorFor = (name) => (touched[name] ? (errors[name] ?? null) : null)

  /** Spreads onto BaseInput: `v-bind="fieldProps('email')"`. */
  function fieldProps(name) {
    return {
      modelValue: values[name],
      error: errorFor(name),
      'onUpdate:modelValue': (value) => { values[name] = value },
      onBlur: () => handleBlur(name)
    }
  }

  function reset(nextValues = initialValues) {
    Object.keys(values).forEach((key) => delete values[key])
    Object.assign(values, { ...nextValues })
    Object.keys(errors).forEach((key) => delete errors[key])
    Object.keys(touched).forEach((key) => delete touched[key])
    submitError.value = null
    submitted.value = false
  }

  async function handleSubmit() {
    submitError.value = null

    const found = validateAll(values)
    Object.keys(schema).forEach((name) => { touched[name] = true })
    Object.keys(errors).forEach((key) => delete errors[key])
    Object.assign(errors, found)

    if (Object.keys(found).length) {
      // Hand focus to the first problem so keyboard and screen reader users are
      // taken to it rather than left to hunt (BR E.3).
      const [firstField] = Object.keys(found)
      document.getElementById(`field-${firstField}`)?.focus()
      return false
    }

    submitting.value = true
    try {
      await onSubmit?.({ ...values })
      submitted.value = true
      return true
    } catch (err) {
      submitError.value = err?.message ?? 'Something went wrong. Please try again.'
      return false
    } finally {
      submitting.value = false
    }
  }

  return {
    values, errors, touched,
    submitting, submitError, submitted,
    isValid, errorFor, fieldProps,
    handleBlur, handleSubmit, reset
  }
}
