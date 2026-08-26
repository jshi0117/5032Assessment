<script setup>
import { computed, useId } from 'vue'

/**
 * Labelled text input with inline error reporting.
 *
 * The accessibility contract lives here so every form gets it for free:
 * the label is bound to the control, the error is announced through
 * aria-describedby, aria-invalid marks the field, and the message is words —
 * never colour alone (WCAG 1.4.1, BR E.3).
 */
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  label: { type: String, required: true },
  name: { type: String, required: true },
  type: { type: String, default: 'text' },
  error: { type: String, default: null },
  hint: { type: String, default: null },
  required: { type: Boolean, default: false },
  autocomplete: { type: String, default: null },
  placeholder: { type: String, default: null },
  disabled: { type: Boolean, default: false },
  min: { type: [String, Number], default: null },
  max: { type: [String, Number], default: null }
})

defineEmits(['update:modelValue', 'blur'])

const uid = useId()
// Stable id so useForm can move focus to the first invalid field.
const fieldId = computed(() => `field-${props.name}`)
const errorId = computed(() => `${fieldId.value}-error-${uid}`)
const hintId = computed(() => `${fieldId.value}-hint-${uid}`)

const describedBy = computed(() => {
  const ids = []
  if (props.hint) ids.push(hintId.value)
  if (props.error) ids.push(errorId.value)
  return ids.length ? ids.join(' ') : undefined
})
</script>

<template>
  <div class="mb-3">
    <label class="form-label" :for="fieldId">
      {{ label }}
      <span v-if="required" class="text-danger" aria-hidden="true">*</span>
      <span v-if="required" class="visually-hidden">(required)</span>
    </label>

    <input
      :id="fieldId"
      class="form-control"
      :class="{ 'is-invalid': error }"
      :type="type"
      :name="name"
      :value="modelValue"
      :required="required"
      :disabled="disabled"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :min="min"
      :max="max"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      @input="$emit('update:modelValue', $event.target.value)"
      @blur="$emit('blur', $event)"
    />

    <p v-if="hint && !error" :id="hintId" class="form-text mb-0">{{ hint }}</p>

    <!-- d-block because Bootstrap only reveals .invalid-feedback inside a
         validated form; the message must show as soon as the rule fails. -->
    <p v-if="error" :id="errorId" class="invalid-feedback d-block mb-0">
      <span aria-hidden="true">&#9888;</span> {{ error }}
    </p>
  </div>
</template>
