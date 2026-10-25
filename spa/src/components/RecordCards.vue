<script setup>
import { formatDate } from '../utils/format'
import RecordValue from './RecordValue.vue'
import RecordActions from './RecordActions.vue'

// The record list on narrow screens: one card per record, titled by the
// record's title field (which is therefore not repeated among the fields).
defineProps({
  moduleName: { type: String, required: true },
  records: { type: Array, required: true },
  columns: { type: Array, required: true },
  labels: { type: Object, required: true }, // fieldName -> Map(recordID -> label)
  titleField: { type: String, default: undefined },
  loading: { type: Boolean, default: false },
  titleOf: { type: Function, required: true },
  userName: { type: Function, required: true },
})
const emit = defineEmits(['edit', 'delete'])
</script>

<template>
  <ul class="record-cards" :aria-label="`${moduleName} records`" :aria-busy="loading || undefined">
    <li v-for="r in records" :key="r.recordID" class="record-card">
      <h2 :id="`card-${r.recordID}`" class="record-card__title">{{ titleOf(r) }}</h2>
      <dl class="record-card__fields">
        <template v-for="f in columns" :key="f.name">
          <div v-if="f.name !== titleField" class="record-card__field">
            <dt>{{ f.label || f.name }}</dt>
            <dd>
              <RecordValue :field="f" :value="r.values[f.name]" :labels="labels[f.name]" placeholder="—" />
            </dd>
          </div>
        </template>
        <div class="record-card__field">
          <dt>Owner</dt>
          <dd>{{ userName(r.ownedBy) || '—' }}</dd>
        </div>
        <div class="record-card__field record-card__field--wide">
          <dt>Created</dt>
          <dd>{{ formatDate(r.createdAt) }}<span class="muted"> by {{ userName(r.createdBy) || '—' }}</span></dd>
        </div>
        <div v-if="r.updatedAt" class="record-card__field record-card__field--wide">
          <dt>Updated</dt>
          <dd>{{ formatDate(r.updatedAt) }}<span class="muted"> by {{ userName(r.updatedBy) || '—' }}</span></dd>
        </div>
      </dl>
      <div class="record-card__actions">
        <RecordActions :record="r" :title="titleOf(r)" @edit="emit('edit', r)" @delete="emit('delete', r)" />
      </div>
    </li>
  </ul>
</template>
