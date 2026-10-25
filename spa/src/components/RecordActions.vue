<script setup>
// Per-record buttons, as the record's permissions allow. The visually hidden
// title tells screen reader users which record each button acts on.
defineProps({
  record: { type: Object, required: true }, // compose.Record
  title: { type: String, required: true },
})
const emit = defineEmits(['edit', 'delete'])
</script>

<template>
  <button v-if="record.canUpdateRecord || record.canReadRecord" type="button" class="btn btn--small" @click="emit('edit')">
    {{ record.canUpdateRecord ? 'Edit' : 'View' }}<span class="sr-only"> “{{ title }}”</span>
  </button>
  <button v-if="record.canDeleteRecord" type="button" class="btn btn--small btn--danger" @click="emit('delete')">
    Delete<span class="sr-only"> “{{ title }}”</span>
  </button>
</template>
