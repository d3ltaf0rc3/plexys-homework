<script setup>
import { computed } from 'vue'
import { formatDate } from '../utils/format'
import { isSortable } from '../composables/useRecordList'
import RecordValue from './RecordValue.vue'
import RecordActions from './RecordActions.vue'

// The record list on wider screens: a table with sortable column headers.
const props = defineProps({
  moduleName: { type: String, required: true },
  records: { type: Array, required: true },
  columns: { type: Array, required: true },
  labels: { type: Object, required: true }, // fieldName -> Map(recordID -> label)
  sort: { type: String, required: true }, // e.g. 'createdAt DESC'
  loading: { type: Boolean, default: false },
  titleOf: { type: Function, required: true },
  userName: { type: Function, required: true },
})
const emit = defineEmits(['sort', 'edit', 'delete'])

// Short, unbreakable values stay on one line; free text gets a minimum width
// so it doesn't collapse into a narrow column (the table scrolls instead).
const NOWRAP_KINDS = new Set(['DateTime', 'Number', 'Email', 'Url', 'Bool', 'Select'])
const cellClass = (f) => (NOWRAP_KINDS.has(f.kind) ? 'nowrap' : 'cell-text')

const sortState = computed(() => {
  const [key, dir] = props.sort.split(' ')
  return { key, desc: dir === 'DESC' }
})

// For aria-sort on the column header.
function ariaSort(key) {
  if (sortState.value.key !== key) return 'none'
  return sortState.value.desc ? 'descending' : 'ascending'
}

function sortIndicator(key) {
  if (sortState.value.key !== key) return ''
  return sortState.value.desc ? '▼' : '▲'
}
</script>

<template>
  <div class="table-wrap" :aria-busy="loading || undefined">
    <table>
      <caption class="sr-only">{{ moduleName }} records</caption>
      <thead>
        <tr>
          <th v-for="f in columns" :key="f.name" scope="col" :aria-sort="isSortable(f) ? ariaSort(f.name) : undefined">
            <button v-if="isSortable(f)" type="button" class="th-sort" @click="emit('sort', f.name)">
              {{ f.label || f.name }} <span aria-hidden="true">{{ sortIndicator(f.name) }}</span>
            </button>
            <template v-else>{{ f.label || f.name }}</template>
          </th>
          <th scope="col">Owner</th>
          <th scope="col" :aria-sort="ariaSort('createdAt')">
            <button type="button" class="th-sort" @click="emit('sort', 'createdAt')">
              Created <span aria-hidden="true">{{ sortIndicator('createdAt') }}</span>
            </button>
          </th>
          <th scope="col" :aria-sort="ariaSort('updatedAt')">
            <button type="button" class="th-sort" @click="emit('sort', 'updatedAt')">
              Updated <span aria-hidden="true">{{ sortIndicator('updatedAt') }}</span>
            </button>
          </th>
          <th scope="col"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in records" :key="r.recordID">
          <td v-for="f in columns" :key="f.name" :class="cellClass(f)">
            <RecordValue :field="f" :value="r.values[f.name]" :labels="labels[f.name]" />
          </td>
          <td class="nowrap">{{ userName(r.ownedBy) }}</td>
          <td class="nowrap">
            {{ formatDate(r.createdAt) }}
            <div class="muted small">by {{ userName(r.createdBy) || '—' }}</div>
          </td>
          <td class="nowrap">
            <template v-if="r.updatedAt">
              {{ formatDate(r.updatedAt) }}
              <div class="muted small">by {{ userName(r.updatedBy) || '—' }}</div>
            </template>
            <span v-else class="muted">—</span>
          </td>
          <td>
            <div class="row-actions__inner">
              <RecordActions :record="r" :title="titleOf(r)" @edit="emit('edit', r)" @delete="emit('delete', r)" />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
