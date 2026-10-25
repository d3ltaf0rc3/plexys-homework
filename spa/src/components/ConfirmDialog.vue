<script setup>
import BaseDialog from './BaseDialog.vue'

// Confirmation for destructive actions. Focus starts on Cancel so a stray
// Enter does not destroy anything; the confirm button names the action.
defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  confirmLabel: { type: String, default: 'Delete' },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['confirm', 'close'])
</script>

<template>
  <BaseDialog :open="open" :title="title" role="alertdialog" size="sm" :busy="busy" close-on-backdrop @close="emit('close')">
    <template #description>
      <slot />
    </template>
    <p v-if="error" class="alert" role="alert">{{ error }}</p>
    <template #footer>
      <button type="button" class="btn" data-autofocus :disabled="busy" @click="emit('close')">Cancel</button>
      <button type="button" class="btn btn--danger-solid" :disabled="busy" @click="emit('confirm')">
        {{ busy ? 'Deleting…' : confirmLabel }}
      </button>
    </template>
  </BaseDialog>
</template>
