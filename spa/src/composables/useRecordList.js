import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listRecords, fetchRecordLabels, recordLabelField, fetchUserNames } from '../api/records'
import { useSchema, findModule, relatedModule } from './useSchema'
import { config } from '../config'

const PAGE_SIZE = 20
const SEARCHABLE = ['String', 'Email', 'Url']

// Record fields would sort by the related record's ID, which means nothing
// to a user, so they are not offered as sort keys.
export const isSortable = (f) => f.isSortable !== false && f.kind !== 'Record'

// One page of records of a module, with search, sort and paging kept in the
// URL query. `handle` picks the module; without one, the configured (ticket)
// module.
export function useRecordList(handle) {
  const route = useRoute()
  const router = useRouter()
  const { load } = useSchema()

  const module = shallowRef(null)
  const records = shallowRef([])
  const labels = shallowRef({}) // fieldName -> Map(recordID -> label)
  const users = shallowRef(new Map())
  const total = ref(0)
  const nextPage = ref('')
  const prevPage = ref('')
  const loading = ref(false)
  const error = ref(null)

  const search = ref(route.query.q || '')
  const sort = ref(route.query.sort || 'createdAt DESC')
  const cursor = ref(route.query.page || '')

  // The field that names a record in messages and button labels.
  const titleField = computed(() => module.value?.fields.find((f) => f.kind === 'String')?.name)
  const titleOf = (r) => (titleField.value && r.values[titleField.value]) || 'Untitled'

  const fields = computed(() => module.value?.fields || [])
  const columns = computed(() => fields.value.filter((f) => !(f.kind === 'String' && f.options?.multiLine) && !f.isMulti).slice(0, 6))

  // Corteza filters records with a SQL-like query language.
  const query = computed(() => {
    const term = search.value.trim().replace(/'/g, "''")
    if (!term) return ''
    return fields.value
      .filter((f) => SEARCHABLE.includes(f.kind))
      .map((f) => `${f.name} LIKE '%${term}%'`)
      .join(' OR ')
  })

  // Readable names for related record IDs and user IDs. A failed lookup only
  // costs the names (the raw ID is shown), never the list itself.
  async function resolveNames(list) {
    const recordFields = columns.value.filter((c) => c.kind === 'Record' && relatedModule(c))
    const [fieldLabels, userMap] = await Promise.all([
      Promise.all(recordFields.map((f) => {
        const rel = relatedModule(f)
        return fetchRecordLabels(rel, recordLabelField(rel, f), list.map((r) => r.values[f.name])).catch(() => undefined)
      })),
      fetchUserNames(list.flatMap((r) => [r.ownedBy, r.createdBy, r.updatedBy])).catch(() => new Map()),
    ])
    return {
      labels: Object.fromEntries(recordFields.map((f, i) => [f.name, fieldLabels[i]])),
      users: new Map(userMap),
    }
  }

  // Corteza maintains owner / created / updated as system fields; the list
  // shows them instead of re-authoring them as module fields.
  const userName = (id) => users.value.get(id) || ''

  // Only the latest request may update the list: a slow response for an older
  // search, sort or page is dropped.
  let fetchNo = 0

  async function fetchRecords() {
    if (!module.value) return
    const no = ++fetchNo
    loading.value = true
    error.value = null
    try {
      const res = await listRecords(module.value, { query: query.value, sort: sort.value, limit: PAGE_SIZE, pageCursor: cursor.value })
      // Names are resolved before the rows are swapped in, so new rows never
      // render against the previous page's labels ("Missing record").
      const names = await resolveNames(res.records)
      if (no !== fetchNo) return
      records.value = res.records
      labels.value = names.labels
      users.value = names.users
      total.value = res.total
      nextPage.value = res.nextPage
      prevPage.value = res.prevPage
    } catch (e) {
      if (no === fetchNo) error.value = e.message
    } finally {
      if (no === fetchNo) loading.value = false
    }
  }

  function syncUrl() {
    router.replace({
      query: {
        ...(search.value ? { q: search.value } : {}),
        ...(sort.value !== 'createdAt DESC' ? { sort: sort.value } : {}),
        ...(cursor.value ? { page: cursor.value } : {}),
      },
    })
  }

  let searchTimer
  watch(search, () => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      cursor.value = ''
      syncUrl()
      fetchRecords()
    }, 300)
  })

  // Clicking a column header: ascending first, then toggles.
  function sortBy(name) {
    const [current, dir] = sort.value.split(' ')
    setSort(current === name && dir !== 'DESC' ? `${name} DESC` : name)
  }

  function setSort(value) {
    sort.value = value
    cursor.value = ''
    syncUrl()
    fetchRecords()
  }

  function goToPage(c) {
    cursor.value = c
    syncUrl()
    fetchRecords()
  }

  onMounted(async () => {
    await load()
    module.value = findModule(handle || config.module)
    if (!module.value && handle) error.value = `There is no module "${handle}" here.`
    if (module.value) document.title = `${module.value.name} records`
    await fetchRecords()
  })

  // A pending debounce must not fire after navigating away: it would rewrite
  // the next route's query and fetch for a list that is gone.
  onBeforeUnmount(() => {
    clearTimeout(searchTimer)
    fetchNo++
  })

  return {
    module, records, labels, total, nextPage, prevPage, loading, error,
    search, sort, columns, titleField, titleOf, userName,
    fetchRecords, sortBy, setSort, goToPage,
  }
}
