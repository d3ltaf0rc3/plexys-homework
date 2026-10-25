import { ref, onMounted, onBeforeUnmount } from 'vue'

// Reactive window.matchMedia. Used to render one layout at a time (table or
// cards) instead of hiding one with CSS, so screen readers and Tab order only
// ever see a single copy of the list.
export function useMediaQuery(query) {
  const mql = window.matchMedia(query)
  const matches = ref(mql.matches)
  const update = (e) => { matches.value = e.matches }
  onMounted(() => mql.addEventListener('change', update))
  onBeforeUnmount(() => mql.removeEventListener('change', update))
  return matches
}
