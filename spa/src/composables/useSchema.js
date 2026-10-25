import { shallowRef, ref, readonly } from 'vue'
import { compose } from '@cortezaproject/corteza-js'
import { composeApi, call } from '../api/client'
import { config } from '../config'

// Loads the configured namespace and all its modules once, as corteza-js
// Module objects. Field definitions drive the list and the forms, so adding
// a field in Corteza needs no code change. Related modules (e.g. Customer)
// are found through the Record field's moduleID, not through extra config.

const namespace = shallowRef(null)
const modules = shallowRef([])
const error = ref(null)
let loading = null

function matches(m, key) {
  const k = key.trim().toLowerCase()
  return m.moduleID === key || m.handle?.toLowerCase() === k || m.name.toLowerCase() === k
}

async function resolve() {
  const nsList = await call(() => composeApi.namespaceList({ slug: config.namespace }))
  const ns = nsList.set?.[0]
  if (!ns) throw new Error(`Namespace "${config.namespace}" not found, or you lack access to it.`)

  const nsObj = new compose.Namespace(ns)
  const res = await call(() => composeApi.moduleList({ namespaceID: nsObj.namespaceID, limit: 200 }))
  const mods = (res.set || []).map((m) => new compose.Module(m, nsObj))
  if (!mods.some((m) => matches(m, config.module))) {
    throw new Error(`Module "${config.module}" not found in namespace "${nsObj.name}".`)
  }

  namespace.value = nsObj
  modules.value = mods
}

export function findModule(key) {
  return modules.value.find((m) => matches(m, key)) || null
}

// The module a Record field points to.
export function relatedModule(field) {
  return field.kind === 'Record' ? findModule(field.options?.moduleID || '') : null
}

// The app's sections: the configured module first, then every module its
// Record fields point to (Support Ticket → Customer).
export function appModules() {
  const main = findModule(config.module)
  if (!main) return []
  const related = main.fields.map(relatedModule).filter(Boolean)
  return [main, ...related.filter((m, i) => related.indexOf(m) === i && m !== main)]
}

export function useSchema() {
  async function load() {
    if (namespace.value) return
    error.value = null
    loading ??= resolve()
      .catch((e) => { error.value = e.message })
      .finally(() => { loading = null })
    await loading
  }

  return { namespace: readonly(namespace), modules: readonly(modules), error: readonly(error), load }
}
