<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount, useId } from 'vue'

// Modal dialog on the native <dialog> element. showModal() gives us the
// focus trap, an inert background and Esc handling from the browser; this
// component adds initial focus, focus return, scroll lock and a busy state
// that blocks closing while a request is in flight.
const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  // 'alertdialog' for confirmations that interrupt the user.
  role: { type: String, default: 'dialog' },
  busy: { type: Boolean, default: false },
  // Forms should not lose input to a stray click outside.
  closeOnBackdrop: { type: Boolean, default: false },
  size: { type: String, default: 'md' }, // 'sm' | 'md'
})
const emit = defineEmits(['close'])

const el = ref(null)
const titleId = useId()
const descId = useId()
let opener = null

const FOCUSABLE = 'input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'

async function show() {
  opener = document.activeElement
  await nextTick()
  if (!el.value || el.value.open) return
  el.value.showModal()
  document.documentElement.classList.add('dialog-open')
  focusInitial()
}

// [data-autofocus] wins; otherwise the first control in the body, so focus
// does not land on the close button.
function focusInitial() {
  const target = el.value.querySelector('[data-autofocus]')
    || el.value.querySelector(`.dialog__body :is(${FOCUSABLE})`)
    || el.value.querySelector('.dialog__close')
  target?.focus()
}

function hide() {
  if (el.value?.open) el.value.close()
  document.documentElement.classList.remove('dialog-open')
  // The opener may be gone (e.g. the row of a deleted record); fall back to
  // the page heading so focus does not reset to the top of the document.
  const back = opener?.isConnected ? opener : document.querySelector('main h1')
  back?.focus()
  opener = null
}

function requestClose() {
  if (!props.busy) emit('close')
}

// Esc: keep the dialog open while busy, otherwise let the parent decide.
function onCancel(e) {
  e.preventDefault()
  requestClose()
}

// The browser can still force-close (e.g. repeated Esc); keep state in sync.
function onClose() {
  if (props.open) emit('close')
}

function onClick(e) {
  if (props.closeOnBackdrop && e.target === el.value) requestClose()
}

watch(() => props.open, (o) => (o ? show() : hide()))
onMounted(() => { if (props.open) show() })
onBeforeUnmount(() => { if (el.value?.open) hide() })

defineExpose({ focusInitial })
</script>

<template>
  <dialog
    ref="el"
    :class="['dialog', `dialog--${size}`]"
    :role="role === 'alertdialog' ? 'alertdialog' : undefined"
    :aria-labelledby="titleId"
    :aria-describedby="$slots.description ? descId : undefined"
    :aria-busy="busy || undefined"
    @cancel="onCancel"
    @close="onClose"
    @click="onClick"
  >
    <div class="dialog__panel">
      <header class="dialog__header">
        <h2 :id="titleId" class="dialog__title">{{ title }}</h2>
        <button type="button" class="btn btn--ghost dialog__close" aria-label="Close" :disabled="busy" @click="requestClose">✕</button>
      </header>
      <div v-if="$slots.description" :id="descId" class="dialog__description">
        <slot name="description" />
      </div>
      <div class="dialog__body">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="dialog__footer">
        <slot name="footer" />
      </footer>
    </div>
  </dialog>
</template>
