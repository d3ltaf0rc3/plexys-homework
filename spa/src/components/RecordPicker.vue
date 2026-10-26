<script setup>
import { ref, computed, watch, nextTick, useId, onBeforeUnmount } from 'vue'
import { listRecords, fetchRecordLabels } from '../api/records'
import { contains } from '../api/query'

// Searchable picker for a Record field (e.g. a ticket's Customer), following
// the WAI-ARIA combobox pattern with a listbox popup. Only records chosen
// from the list can be stored, so the field never points at a made-up ID
// (Corteza itself accepts any ID).
const props = defineProps({
  module: { type: Object, required: true }, // related compose.Module
  labelField: { type: String, required: true },
  id: { type: String, required: true },
  // Accessible name when no <label for> targets this input (extra rows of a
  // multi-value field).
  ariaLabel: { type: String, default: '' },
  required: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
  describedby: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})
const model = defineModel({ type: String, default: '' }) // recordID or ''

const LIMIT = 10
const listID = useId()
const statusID = useId()

const text = ref('') // what the input shows / the search term
const selectedLabel = ref('')
const options = ref([]) // [{ recordID, label }]
const open = ref(false)
const active = ref(-1)
const loading = ref(false)
const status = ref('')
let searchTimer
let requestNo = 0

const optionID = (i) => `${listID}-opt-${i}`
const activeID = computed(() => (open.value && active.value >= 0 ? optionID(active.value) : undefined))

// Show the label of the current value (when editing an existing record).
watch(model, async (id, _, onCleanup) => {
  // A newer value (or unmount) makes this lookup's result irrelevant.
  let stale = false
  onCleanup(() => { stale = true })
  if (!id) {
    selectedLabel.value = ''
    text.value = ''
    return
  }
  if (options.value.some((o) => o.recordID === id && o.label === selectedLabel.value)) return
  const labels = await fetchRecordLabels(props.module, props.labelField, [id]).catch(() => new Map())
  if (stale) return
  selectedLabel.value = labels.get(id) || `Missing ${props.module.name.toLowerCase()} (${id})`
  text.value = selectedLabel.value
}, { immediate: true })

async function search(term) {
  const no = ++requestNo
  loading.value = true
  const t = term.trim()
  try {
    const { records, total } = await listRecords(props.module, {
      query: t ? contains(props.labelField, t) : '',
      sort: props.labelField,
      limit: LIMIT,
    })
    if (no !== requestNo) return // a newer search superseded this one
    options.value = records.map((r) => ({ recordID: r.recordID, label: r.values[props.labelField] || r.recordID }))
    // Start on the current selection when it is in the results.
    active.value = options.value.length ? Math.max(0, options.value.findIndex((o) => o.recordID === model.value)) : -1
    if (open.value) revealList()
    status.value = options.value.length
      ?`${total} result${total === 1 ? '' : 's'}${total > LIMIT ? `, showing first ${LIMIT}` : ''}. Use up and down arrows to choose.`
      : 'No results.'
  } catch (e) {
    if (no !== requestNo) return
    options.value = []
    status.value = `Search failed: ${e.message}`
  } finally {
    if (no === requestNo) loading.value = false
  }
}

// Inside a scrolling dialog body the popup can open below the visible area;
// it extends the scroll area, so bring it into view.
const listEl = ref(null)
function revealList() {
  nextTick(() => listEl.value?.scrollIntoView({ block: 'nearest' }))
}

function openList() {
  if (open.value) return
  open.value = true
  revealList()
  // Opening on a selected value lists everything, not just that one match.
  search(text.value === selectedLabel.value ? '' : text.value)
}

// No search may start (or land) after the picker is gone.
onBeforeUnmount(() => {
  clearTimeout(searchTimer)
  requestNo++
})

function close() {
  open.value = false
  active.value = -1
  status.value = ''
}

function onInput(e) {
  text.value = e.target.value
  open.value = true
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => search(text.value), 250)
}

function choose(o) {
  options.value = [o]
  selectedLabel.value = o.label
  text.value = o.label
  model.value = o.recordID
  close()
}

function clear() {
  model.value = ''
  selectedLabel.value = ''
  text.value = ''
  close()
}

function move(delta) {
  if (!open.value) return openList()
  if (!options.value.length) return
  active.value = (active.value + delta + options.value.length) % options.value.length
  nextTick(() => document.getElementById(activeID.value)?.scrollIntoView({ block: 'nearest' }))
}

function onKeydown(e) {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      move(1)
      break
    case 'ArrowUp':
      e.preventDefault()
      move(-1)
      break
    case 'Enter':
      // Choose the highlighted option instead of submitting the form.
      if (open.value && options.value[active.value]) {
        e.preventDefault()
        choose(options.value[active.value])
      }
      break
    case 'Escape':
      // First Esc closes the list (and must not close the surrounding dialog);
      // with the list closed, Esc reaches the dialog as usual.
      if (open.value) {
        e.preventDefault()
        e.stopPropagation()
        text.value = selectedLabel.value
        close()
      }
      break
    case 'Tab':
      close()
      break
  }
}

// Leaving the field never keeps half-typed text: it snaps back to the
// selection, or clears the value if the user emptied the box. (Options use
// mousedown.prevent, so clicking one does not blur the input.)
function onBlur() {
  if (!text.value.trim()) clear()
  else text.value = selectedLabel.value
  close()
}
</script>

<template>
  <div class="picker">
    <div class="picker__control">
      <input
        :id="id"
        type="text"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        :aria-expanded="open"
        :aria-controls="listID"
        :aria-activedescendant="activeID"
        :aria-required="required || undefined"
        :aria-invalid="invalid || undefined"
        :aria-describedby="describedby || undefined"
        :aria-label="ariaLabel || undefined"
        :value="text"
        :disabled="disabled"
        :placeholder="`Search ${module.name.toLowerCase()}s…`"
        @input="onInput"
        @keydown="onKeydown"
        @focus="$event.target.select()"
        @click="openList"
        @blur="onBlur"
      />
      <button
        v-if="model && !disabled"
        type="button"
        class="btn btn--ghost picker__clear"
        :aria-label="`Clear ${module.name.toLowerCase()}`"
        @click="clear"
      >✕</button>
    </div>

    <ul v-show="open" :id="listID" ref="listEl" role="listbox" class="picker__list" :aria-label="`${module.name} results`">
      <li v-if="loading && !options.length" class="picker__note" role="presentation">Searching…</li>
      <li v-else-if="!options.length" class="picker__note" role="presentation">No {{ module.name.toLowerCase() }}s found.</li>
      <li
        v-for="(o, i) in options"
        :id="optionID(i)"
        :key="o.recordID"
        role="option"
        :aria-selected="o.recordID === model"
        :class="['picker__option', { 'is-active': i === active }]"
        @mousedown.prevent="choose(o)"
        @mousemove="active = i"
      >{{ o.label }}</li>
    </ul>

    <span :id="statusID" class="sr-only" role="status" aria-live="polite">{{ status }}</span>
  </div>
</template>
