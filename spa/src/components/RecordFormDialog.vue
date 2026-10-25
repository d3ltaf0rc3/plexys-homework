<script setup>
import { ref, shallowRef, computed, watch, nextTick, useId } from 'vue'
import { NoID } from '@cortezaproject/corteza-js'
import { newRecord, readRecord, saveRecord, validateRecord, fieldErrors as toFieldErrors, fetchUserNames } from '../api/records'
import { formatDate } from '../utils/format'
import BaseDialog from './BaseDialog.vue'
import FieldInput from './FieldInput.vue'

// Create / edit a record of `module` in a modal. recordID '' means create.
const props = defineProps({
  open: { type: Boolean, default: false },
  module: { type: Object, required: true },
  recordID: { type: String, default: '' },
})
const emit = defineEmits(['close', 'saved'])

const dialog = ref(null)
const formEl = ref(null)
const formId = useId()
const record = shallowRef(null) // compose.Record as loaded (not edited directly)
const form = ref(null) // plain { fieldName: value } being edited
const users = shallowRef(new Map())
const loading = ref(false)
const saving = ref(false)
const error = ref(null)
const fieldErrors = ref({})

const isNew = computed(() => !props.recordID)
// Permissions come with the module and record from Corteza: a record the user
// may read but not update opens read-only, and fields hidden from the user
// (canReadRecordValue) are left out entirely.
const readonly = computed(() => !isNew.value && record.value && !record.value.canUpdateRecord)
const fields = computed(() => props.module.fields.filter((f) => f.canReadRecordValue))
const fieldLocked = (f) => readonly.value || !f.canUpdateRecordValue
const title = computed(() => `${isNew.value ? 'New' : readonly.value ? 'View' : 'Edit'} ${props.module.name}`)

const fid = (f) => `${formId}-${f.name}`

// Plain copy of the record's values for editing; the compose.Record stays
// untouched until save so its "clean" values remain the original ones.
function toForm(r) {
  return Object.fromEntries(fields.value.map((f) => [f.name, f.isMulti ? [...(r.values[f.name] || [])] : r.values[f.name] ?? '']))
}

// Closing and reopening (e.g. on another record) before a load finishes must
// not let the older response fill the form.
let loadNo = 0

async function load() {
  const no = ++loadNo
  record.value = null
  form.value = null
  error.value = null
  fieldErrors.value = {}
  users.value = new Map()
  loading.value = true
  try {
    const r = isNew.value ? newRecord(props.module) : await readRecord(props.module, props.recordID)
    const names = isNew.value ? new Map() : await fetchUserNames([r.createdBy, r.updatedBy, r.ownedBy]).catch(() => new Map())
    if (no !== loadNo) return
    record.value = r
    form.value = toForm(r)
    users.value = new Map(names)
  } catch (e) {
    if (no === loadNo) error.value = e.message
  } finally {
    if (no === loadNo) loading.value = false
  }
  if (no !== loadNo) return
  await nextTick()
  dialog.value?.focusInitial()
}

watch(() => props.open, (o) => { if (o) load(); else loadNo++ }, { immediate: true })

// Move focus to the first invalid field (or the error summary) so keyboard
// and screen reader users land on what needs fixing.
async function focusFirstProblem() {
  await nextTick()
  const target = formEl.value?.querySelector('[aria-invalid="true"]') || formEl.value?.querySelector('.alert')
  target?.focus()
}

async function save() {
  if (readonly.value) return
  error.value = null
  const draft = record.value.clone()
  // setValue treats '' as "no value"; drop blank rows of multi-value fields.
  for (const [name, v] of Object.entries(form.value)) {
    draft.setValue(name, Array.isArray(v) ? v.filter((x) => x !== '') : v)
  }

  fieldErrors.value = validateRecord(draft)
  if (Object.keys(fieldErrors.value).length) {
    error.value = 'Please correct the highlighted fields.'
    return focusFirstProblem()
  }

  saving.value = true
  try {
    const saved = await saveRecord(draft)
    emit('saved', saved, { created: draft.recordID === NoID })
  } catch (e) {
    // Server-side validation: { message, details: [{ kind, message, meta: { field } }] }
    fieldErrors.value = toFieldErrors(e.details?.details)
    error.value = e.message
    focusFirstProblem()
  } finally {
    saving.value = false
  }
}

function describedBy(f) {
  return [hintText(f) && `${fid(f)}-hint`, fieldErrors.value[f.name] && `${fid(f)}-error`].filter(Boolean).join(' ')
}

function hintText(f) {
  return f.options?.description?.edit || f.options?.hint?.edit || ''
}
</script>

<template>
  <BaseDialog ref="dialog" :open="open" :title="title" :busy="saving" @close="emit('close')">
    <template v-if="record && !isNew" #description>
      <p class="muted small">
        Created {{ formatDate(record.createdAt) }} by {{ users.get(record.createdBy) || '—' }}
        <template v-if="record.updatedAt"> · Updated {{ formatDate(record.updatedAt) }} by {{ users.get(record.updatedBy) || '—' }}</template>
        · Owner {{ users.get(record.ownedBy) || '—' }}
      </p>
    </template>

    <p v-if="loading" class="muted" role="status">Loading…</p>

    <form v-else-if="form" :id="formId" ref="formEl" novalidate @submit.prevent="save">
      <p v-if="error" class="alert" role="alert" tabindex="-1">{{ error }}</p>
      <p v-if="readonly" class="muted small form-legend">You can view this {{ module.name.toLowerCase() }} but not change it.</p>
      <p v-else class="muted small form-legend"><span class="required" aria-hidden="true">*</span> Required field</p>

      <div v-for="f in fields" :key="f.name" class="form-row">
        <label v-if="f.kind !== 'Bool'" :for="fid(f)">
          {{ f.label || f.name }}<span v-if="f.isRequired" class="required" aria-hidden="true">*</span>
          <span v-if="f.isRequired" class="sr-only">(required)</span>
        </label>
        <FieldInput
          :id="fid(f)"
          v-model="form[f.name]"
          :field="f"
          :invalid="!!fieldErrors[f.name]"
          :describedby="describedBy(f)"
          :disabled="fieldLocked(f)"
        />
        <p v-if="hintText(f)" :id="`${fid(f)}-hint`" class="muted small">{{ hintText(f) }}</p>
        <p v-if="fieldErrors[f.name]" :id="`${fid(f)}-error`" class="field-error">{{ fieldErrors[f.name] }}</p>
      </div>
    </form>

    <p v-else-if="error" class="alert" role="alert">{{ error }}</p>

    <template #footer>
      <button type="button" class="btn" :disabled="saving" @click="emit('close')">{{ readonly ? 'Close' : 'Cancel' }}</button>
      <button v-if="!readonly" type="submit" :form="formId" class="btn btn--primary" :disabled="saving || !form">
        {{ saving ? 'Saving…' : isNew ? 'Create' : 'Save changes' }}
      </button>
    </template>
  </BaseDialog>
</template>
