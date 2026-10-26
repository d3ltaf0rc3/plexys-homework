import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listRecords, countRecords, fetchRecordLabels, recordLabelField, fetchUserNames } from '../api/records'
import { contains, anyOf } from '../api/query'
import { useSchema, findModule, relatedModule } from './useSchema'
import { config } from '../config'

const PAGE_SIZE = 20
const SEARCHABLE = ['String', 'Email', 'Url']
const DEFAULT_SORT = 'createdAt DESC'
const SEARCH_DELAY = 300

// A query parameter as a string (it may be missing or repeated).
const param = (v) => (typeof v === 'string' ? v : '')

// Record fields would sort by the related record's ID, which means nothing
// to a user, so they are not offered as sort keys.
export const isSortable = (f) => f.isSortable !== false && f.kind !== 'Record'

// One page of records of a module. `handle` picks the module; without one,
// the configured (ticket) module.
//
// The URL query (?q=&sort=&page=) is the single source of truth for search,
// sort and paging: actions only navigate, and every change of the query,
// including Back / Forward and edits to the address, refetches the list.
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

  // This instance lists one path. While navigating away the route already
  // shows the next page, whose query must not refetch this list, so the last
  // state is kept. Returning the previous object when nothing changed keeps
  // unrelated query changes from triggering a fetch.
  const path = route.path
  const state = computed((prev) => {
    if (route.path !== path) return prev
    const next = {
      q: param(route.query.q).trim(),
      sort: param(route.query.sort) || DEFAULT_SORT,
      page: param(route.query.page),
    }
    return prev && prev.q === next.q && prev.sort === next.sort && prev.page === next.page ? prev : next
  })
  const sort = computed(() => state.value.sort)

  // Sorting and paging push history entries; typing replaces the
  // current one, so Back does not replay every keystroke.
  function navigate(patch, { replace = false } = {}) {
    const next = { ...state.value, ...patch }
    const query = {
      ...(next.q ? { q: next.q } : {}),
      ...(next.sort !== DEFAULT_SORT ? { sort: next.sort } : {}),
      ...(next.page ? { page: next.page } : {}),
    }
    return replace ? router.replace({ query }) : router.push({ query })
  }

  // The search box's text: it follows the URL (e.g. on Back) and is written
  // to it once typing pauses.
  const search = ref(state.value.q)

  // The field that names a record in messages and button labels.
  const titleField = computed(() => module.value?.fields.find((f) => f.kind === 'String')?.name)
  const titleOf = (r) => (titleField.value && r.values[titleField.value]) || 'Untitled'

  const fields = computed(() => module.value?.fields || [])
  const columns = computed(() => fields.value.filter((f) => !(f.kind === 'String' && f.options?.multiLine) && !f.isMulti).slice(0, 6))

  // Corteza filters records with a SQL-like query language.
  const query = computed(() => {
    const term = state.value.q
    if (!term) return ''
    return anyOf(fields.value.filter((f) => SEARCHABLE.includes(f.kind)).map((f) => contains(f.name, term)))
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

  // Pages after the first come without a total (Corteza refuses one with a
  // page cursor). Paging keeps the total counted for the same search; a page
  // opened directly (a link, a reload, Back across searches) counts once.
  let countedQuery = null

  async function fetchRecords() {
    if (!module.value) return
    const no = ++fetchNo
    loading.value = true
    error.value = null
    try {
      const { sort, page } = state.value
      const q = query.value
      const [res, count] = await Promise.all([
        listRecords(module.value, { query: q, sort, limit: PAGE_SIZE, pageCursor: page }),
        page && countedQuery !== q ? countRecords(module.value, { query: q }) : null,
      ])
      // Names are resolved before the rows are swapped in, so new rows never
      // render against the previous page's labels ("Missing record").
      const names = await resolveNames(res.records)
      if (no !== fetchNo) return
      records.value = res.records
      labels.value = names.labels
      users.value = names.users
      if (res.total !== null || count !== null) {
        total.value = res.total ?? count
        countedQuery = q
      }
      nextPage.value = res.nextPage
      prevPage.value = res.prevPage
    } catch (e) {
      if (no === fetchNo) error.value = e.message
    } finally {
      if (no === fetchNo) loading.value = false
    }
  }

  // The one place that fetches for a changed list: the module (once loaded),
  // the search, the sort or the page.
  watch([module, query, sort, () => state.value.page], () => fetchRecords())

  // After a create, update or delete: the same page again, recounted.
  function refresh() {
    countedQuery = null
    return fetchRecords()
  }

  let searchTimer
  watch(() => state.value.q, (q) => {
    clearTimeout(searchTimer)
    if (search.value.trim() !== q) search.value = q
  })
  watch(search, (text) => {
    clearTimeout(searchTimer)
    if (text.trim() === state.value.q) return
    searchTimer = setTimeout(() => navigate({ q: text.trim(), page: '' }, { replace: true }), SEARCH_DELAY)
  })

  // Clicking a column header: ascending first, then toggles.
  function sortBy(name) {
    const [current, dir] = sort.value.split(' ')
    setSort(current === name && dir !== 'DESC' ? `${name} DESC` : name)
  }

  function setSort(value) {
    navigate({ sort: value, page: '' })
  }

  function goToPage(cursor) {
    navigate({ page: cursor })
  }

  onMounted(async () => {
    await load()
    module.value = findModule(handle || config.module)
    if (!module.value && handle) error.value = `There is no module "${handle}" here.`
    if (module.value) document.title = `${module.value.name} records`
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
    refresh, sortBy, setSort, goToPage,
  }
}
