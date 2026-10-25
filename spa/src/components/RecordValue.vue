<script setup>
import { formatValue, optionStyle } from '../utils/format'

// One field value of a record in the list: Select options as a (coloured)
// badge, everything else as formatted text.
defineProps({
  field: { type: Object, required: true }, // compose.ModuleField
  value: { default: undefined }, // raw value: a string, or an array for multi-value fields
  labels: { type: Map, default: undefined }, // related recordID -> label
  placeholder: { type: String, default: '' }, // shown for an empty value
})
</script>

<template>
  <span v-if="field.kind === 'Select' && value" class="badge" :style="optionStyle(field, value)">
    {{ formatValue(field, value) }}
  </span>
  <template v-else>{{ formatValue(field, value, labels) || placeholder }}</template>
</template>
