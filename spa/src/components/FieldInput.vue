<script setup>
import { ref, computed, watch } from 'vue'
import { selectOptions, isTruthy } from '../utils/format'
import { relatedModule } from '../composables/useSchema'
import { recordLabelField } from '../api/records'
import RecordPicker from './RecordPicker.vue'

// Renders an input for one Corteza module field. Works with a single string
// value, or an array of strings for multi-value fields.
const props = defineProps({
  field: { type: Object, required: true },
  id: { type: String, required: true },
  invalid: { type: Boolean, default: false },
  // ID(s) of the hint / error text, for aria-describedby.
  describedby: { type: String, default: '' },
  // Read-only view, or a field the user may not change (canUpdateRecordValue).
  disabled: { type: Boolean, default: false },
})

// The form's <label for> targets the first control, which also carries the
// error and hint. Further rows of a multi-value field get their own ID and
// an explicit name ("Tags, value 2"), since no label points at them.
const fieldLabel = computed(() => props.field.label || props.field.name)
const rowID = (i) => (i === 0 ? props.id : `${props.id}-${i}`)
const rowLabel = (i) => (i === 0 ? undefined : `${fieldLabel.value}, value ${i + 1}`)
const a11y = (i) => ({
  id: rowID(i),
  'aria-label': rowLabel(i),
  ...(i === 0 ? { 'aria-invalid': props.invalid || undefined, 'aria-describedby': props.describedby || undefined } : {}),
  disabled: props.disabled || undefined,
})
const model = defineModel({ type: [String, Array], default: '' })

const options = computed(() => selectOptions(props.field))

// Record fields get a picker over the related module, when we can see it.
const related = computed(() => relatedModule(props.field))
const relatedLabel = computed(() => related.value && recordLabelField(related.value, props.field))
const opts = computed(() => props.field.options || {})

const inputType = computed(() => {
  switch (props.field.kind) {
    case 'Number': return 'number'
    case 'Email': return 'email'
    case 'Url': return 'url'
    case 'DateTime': return opts.value.onlyDate ? 'date' : opts.value.onlyTime ? 'time' : 'datetime-local'
    default: return 'text'
  }
})

// datetime-local works in local time without a zone; Corteza stores UTC ISO.
function toInput(value) {
  if (!value || props.field.kind !== 'DateTime') return value ?? ''
  if (opts.value.onlyTime) return value.slice(0, 5)
  if (opts.value.onlyDate) return value.slice(0, 10)
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function fromInput(value) {
  if (!value || props.field.kind !== 'DateTime' || opts.value.onlyDate || opts.value.onlyTime) return value
  return new Date(value).toISOString()
}

const items = computed(() => (props.field.isMulti ? model.value || [] : [model.value]))

// Stable row keys, so removing a row drops that row's DOM (and the picker
// state inside it) instead of shifting every later row up by one.
let nextKey = 0
const keys = ref([])
watch(() => items.value.length, (n) => {
  while (keys.value.length < n) keys.value.push(nextKey++)
  if (keys.value.length > n) keys.value.splice(n)
}, { immediate: true })

function update(index, value) {
  const v = fromInput(value)
  if (!props.field.isMulti) {
    model.value = v
    return
  }
  const next = [...items.value]
  next[index] = v
  model.value = next
}

function add() {
  model.value = [...items.value, '']
}

function remove(index) {
  keys.value.splice(index, 1)
  model.value = items.value.filter((_, i) => i !== index)
}
</script>

<template>
  <div class="field-input">
    <div v-for="(item, i) in items" :key="keys[i]" class="field-input__row">
      <label v-if="field.kind === 'Bool'" class="checkbox">
        <input
          v-bind="a11y(i)"
          type="checkbox"
          :checked="isTruthy(item)"
          @change="update(i, $event.target.checked ? '1' : '0')"
        />
        {{ fieldLabel }}
      </label>

      <RecordPicker
        v-else-if="field.kind === 'Record' && related"
        :id="rowID(i)"
        :aria-label="rowLabel(i)"
        :model-value="item"
        :module="related"
        :label-field="relatedLabel"
        :disabled="disabled"
        :required="field.isRequired"
        :invalid="i === 0 && invalid"
        :describedby="i === 0 ? describedby : ''"
        @update:model-value="update(i, $event)"
      />

      <select
        v-else-if="field.kind === 'Select'"
        v-bind="a11y(i)"
        :value="item"
        :required="field.isRequired"
        @change="update(i, $event.target.value)"
      >
        <option value="">—</option>
        <option v-for="o in options" :key="o.value" :value="o.value">{{ o.text }}</option>
      </select>

      <textarea
        v-else-if="field.kind === 'String' && opts.multiLine"
        v-bind="a11y(i)"
        :value="item"
        :required="field.isRequired"
        rows="4"
        @input="update(i, $event.target.value)"
      />

      <input
        v-else
        v-bind="a11y(i)"
        :type="inputType"
        :value="toInput(item)"
        :required="field.isRequired"
        step="any"
        @input="update(i, $event.target.value)"
      />

      <button v-if="field.isMulti && !disabled" type="button" class="btn btn--ghost" :aria-label="`Remove ${fieldLabel} value ${i + 1}`" @click="remove(i)">✕</button>
    </div>
    <button v-if="field.isMulti && !disabled" type="button" class="btn btn--ghost btn--small" @click="add">+ Add value</button>
  </div>
</template>
