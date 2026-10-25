<script setup>
import { ref, watch } from 'vue'
import { deleteRecord, countReferences } from '../api/records'
import ConfirmDialog from './ConfirmDialog.vue'

// Confirms deleting `record` (open while it is set). Corteza deletes a record
// even if others still point at it (e.g. a customer's tickets), so the
// confirmation says what would be left behind.
const props = defineProps({
  record: { type: Object, default: null }, // compose.Record pending confirmation
  module: { type: Object, required: true }, // its compose.Module
  modules: { type: Array, required: true }, // all modules, searched for references
  title: { type: String, default: '' }, // the record's title
  // Awaited after the delete and before the dialog stops being busy, so the
  // parent can refresh the list first (declared as a prop, not an emit, for
  // exactly that reason).
  onDeleted: { type: Function, default: undefined },
})
const emit = defineEmits(['close'])

const busy = ref(false)
const error = ref('')
const references = ref(null) // null while counting, then [{ module, field, total }]

watch(() => props.record, async (r) => {
  if (!r) return
  error.value = ''
  references.value = null
  const refs = await countReferences(r, props.modules).catch(() => [])
  // The dialog may have been closed, or opened for another record, meanwhile.
  if (props.record === r) references.value = refs
})

async function confirm() {
  const r = props.record
  busy.value = true
  error.value = ''
  try {
    await deleteRecord(r)
    await props.onDeleted?.(r)
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <ConfirmDialog
    :open="!!record"
    :title="`Delete ${module.name.toLowerCase()}?`"
    :busy="busy"
    :error="error"
    @confirm="confirm"
    @close="emit('close')"
  >
    <p v-if="record">“{{ title }}” will be deleted.</p>
    <p v-if="references === null" class="muted small">Checking for related records…</p>
    <p v-for="x in references" v-else :key="x.module.moduleID + x.field.name" class="warning">
      {{ x.total }} {{ x.module.name.toLowerCase() }}{{ x.total === 1 ? '' : 's' }}
      still {{ x.total === 1 ? 'points' : 'point' }} to it and will show it as a missing record.
    </p>
  </ConfirmDialog>
</template>
