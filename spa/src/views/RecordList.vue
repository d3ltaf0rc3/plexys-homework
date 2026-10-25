<script setup>
import { ref, shallowRef, computed, onBeforeUnmount } from 'vue'
import { useSchema } from '../composables/useSchema'
import { useRecordList, isSortable } from '../composables/useRecordList'
import { useMediaQuery } from '../composables/useMediaQuery'
import RecordTable from '../components/RecordTable.vue'
import RecordCards from '../components/RecordCards.vue'
import RecordFormDialog from '../components/RecordFormDialog.vue'
import DeleteRecordDialog from '../components/DeleteRecordDialog.vue'

// Lists any module of the namespace; without a handle, the configured
// (ticket) module.
const props = defineProps({
  handle: { type: String, default: '' },
})

const { error: schemaError, modules } = useSchema()
// RouterView is keyed by path, so the handle never changes for this instance.
const {
  module, records, labels, total, nextPage, prevPage, loading, error,
  search, sort, columns, titleField, titleOf, userName,
  fetchRecords, sortBy, setSort, goToPage,
} = useRecordList(props.handle)

// Cards below this width, a table above it.
const narrow = useMediaQuery('(max-width: 720px)')

// Create / edit modal
const formOpen = ref(false)
const editingID = ref('')

// Delete confirmation
const deleting = shallowRef(null) // compose.Record pending confirmation

// Announced to screen readers via role="status", and shown briefly.
const notice = ref('')
let noticeTimer
function announce(text) {
  clearTimeout(noticeTimer)
  notice.value = text
  noticeTimer = setTimeout(() => { notice.value = '' }, 6000)
}

function openCreate() {
  editingID.value = ''
  formOpen.value = true
}

function openEdit(r) {
  editingID.value = r.recordID
  formOpen.value = true
}

async function onSaved(r, { created }) {
  formOpen.value = false
  announce(`${module.value.name} “${titleOf(r)}” ${created ? 'created' : 'saved'}.`)
  await fetchRecords()
}

async function onDeleted(r) {
  // Refresh before closing: the row (and its Delete button) is gone by the
  // time the dialog returns focus, so focus goes to the page heading.
  await fetchRecords()
  deleting.value = null
  announce(`${module.value.name} “${titleOf(r)}” deleted.`)
}

// Sort choices for the card layout, which has no column headers.
const sortChoices = computed(() => {
  // Corteza sorts Select fields by stored value, not by option order, so
  // only text fields get "A to Z" wording.
  const alpha = ['Z to A', 'A to Z']
  const words = { DateTime: ['newest first', 'oldest first'], String: alpha, Email: alpha, Url: alpha }
  const keys = [
    ...columns.value.filter(isSortable).map((f) => ({ key: f.name, label: f.label || f.name, kind: f.kind })),
    { key: 'createdAt', label: 'Created', kind: 'DateTime' },
    { key: 'updatedAt', label: 'Updated', kind: 'DateTime' },
  ]
  return keys.flatMap(({ key, label, kind }) => {
    const [desc, asc] = words[kind] || ['descending', 'ascending']
    return [{ value: `${key} DESC`, text: `${label}, ${desc}` }, { value: key, text: `${label}, ${asc}` }]
  })
})

onBeforeUnmount(() => clearTimeout(noticeTimer))
</script>

<template>
  <section>
    <header class="page-header">
      <div>
        <h1 tabindex="-1">{{ module?.name || 'Records' }}</h1>
        <p v-if="module" class="muted" aria-live="polite">
          {{ loading ? 'Loading…' : `${total} record${total === 1 ? '' : 's'}${search.trim() ? ' found' : ''}` }}
        </p>
      </div>
      <button v-if="module?.canCreateRecord" type="button" class="btn btn--primary" @click="openCreate">+ New {{ module.name }}</button>
    </header>

    <p class="toast" role="status" aria-live="polite">{{ notice }}</p>

    <p v-if="schemaError" class="alert">{{ schemaError }}</p>

    <template v-else-if="module">
      <div class="toolbar">
        <div class="toolbar__field">
          <label for="list-search">Search</label>
          <input id="list-search" v-model="search" type="search" :placeholder="`Search ${module.name.toLowerCase()}s…`" />
        </div>
        <div v-if="narrow" class="toolbar__field">
          <label for="list-sort">Sort by</label>
          <select id="list-sort" :value="sort" @change="setSort($event.target.value)">
            <option v-for="o in sortChoices" :key="o.value" :value="o.value">{{ o.text }}</option>
          </select>
        </div>
      </div>

      <p v-if="error" class="alert" role="alert">{{ error }}</p>

      <p v-if="!records.length" class="empty muted">{{ loading ? 'Loading…' : 'No records found.' }}</p>

      <RecordCards
        v-else-if="narrow"
        :module-name="module.name"
        :records="records"
        :columns="columns"
        :labels="labels"
        :title-field="titleField"
        :loading="loading"
        :title-of="titleOf"
        :user-name="userName"
        @edit="openEdit"
        @delete="deleting = $event"
      />

      <RecordTable
        v-else
        :module-name="module.name"
        :records="records"
        :columns="columns"
        :labels="labels"
        :sort="sort"
        :loading="loading"
        :title-of="titleOf"
        :user-name="userName"
        @sort="sortBy"
        @edit="openEdit"
        @delete="deleting = $event"
      />

      <nav class="pager" aria-label="Pagination">
        <button type="button" class="btn" :disabled="!prevPage || loading" @click="goToPage(prevPage)">← Previous</button>
        <button type="button" class="btn" :disabled="!nextPage || loading" @click="goToPage(nextPage)">Next →</button>
      </nav>

      <RecordFormDialog :open="formOpen" :module="module" :recordID="editingID" @close="formOpen = false" @saved="onSaved" />

      <DeleteRecordDialog
        :record="deleting"
        :module="module"
        :modules="modules"
        :title="deleting ? titleOf(deleting) : ''"
        :on-deleted="onDeleted"
        @close="deleting = null"
      />
    </template>

    <p v-else-if="error" class="alert" role="alert">{{ error }}</p>
    <p v-else class="muted">Loading module…</p>
  </section>
</template>
