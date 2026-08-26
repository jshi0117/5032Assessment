<script setup>
import { computed, useId } from 'vue'

/**
 * Labelled select. Mirrors BaseInput's accessibility contract.
 * `options` accepts plain strings or `{ value, label }` objects.
 */
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  label: { type: String, required: true },
  name: { type: String, required: true },
  options: { type: Array, required: true },
  error: { type: String, default: null },
  hint: { type: String, default: null },
  required: { type: Boolean, default: false },
  placeholder: { type: String, default: 'Please choose…' },
  disabled: { type: Boolean, default: false }
})

defineEmits(['update:modelValue', 'blur'])

const uid = useId()
const fieldId = computed(() => `field-${props.name}`)
const errorId = computed(() => `${fieldId.value}-error-${uid}`)
const hintId = computed(() => `${fieldId.value}-hint-${uid}`)

const normalised = computed(() =>
  props.options.map((option) =>
    typeof option === 'object' ? option : { value: option, label: option }
  )
)

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

    <select
      :id="fieldId"
      class="form-select"
      :class="{ 'is-invalid': error }"
      :name="name"
      :value="modelValue"
      :required="required"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      @change="$emit('update:modelValue', $event.target.value)"
      @blur="$emit('blur', $event)"
    >
      <option value="" disabled>{{ placeholder }}</option>
      <option v-for="option in normalised" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>

    <p v-if="hint && !error" :id="hintId" class="form-text mb-0">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="invalid-feedback d-block mb-0">
      <span aria-hidden="true">&#9888;</span> {{ error }}
    </p>
  </div>
</template>
