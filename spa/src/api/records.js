import { compose, NoID } from '@cortezaproject/corteza-js'
import { composeApi, systemApi, call } from './client'
import { eq, anyOf } from './query'

// Record CRUD on top of corteza-js. Everything returned is a compose.Record,
// which keeps values keyed by field name and serializes them back to
// Corteza's [{ name, value }] wire format.

const ids = (module) => ({ namespaceID: module.namespaceID, moduleID: module.moduleID })

export function newRecord(module) {
  return new compose.Record(module)
}

// Corteza refuses a total count together with a page cursor, so `total` is
// only known for the first page; with a cursor it is null (see countRecords).
export async function listRecords(module, { query, sort, limit = 20, pageCursor } = {}) {
  const res = await call(() => composeApi.recordList({
    ...ids(module), query, sort, limit, pageCursor, incTotal: !pageCursor,
  }))
  return {
    records: (res.set || []).map((r) => new compose.Record(module, r)),
    total: pageCursor ? null : res.filter?.total ?? 0,
    nextPage: res.filter?.nextPage || '',
    prevPage: res.filter?.prevPage || '',
  }
}

// Number of records matching `query`, for when a page was fetched by cursor.
export async function countRecords(module, { query } = {}) {
  return (await listRecords(module, { query, limit: 1 })).total
}

export async function readRecord(module, recordID) {
  return new compose.Record(module, await call(() => composeApi.recordRead({ ...ids(module), recordID })))
}

// Creates or updates, depending on whether the record has an ID yet.
export async function saveRecord(record) {
  const module = record.module
  const values = record.serializeValues()
  const res = record.recordID === NoID
    ? await call(() => composeApi.recordCreate({ ...ids(module), values }))
    : await call(() => composeApi.recordUpdate({ ...ids(module), recordID: record.recordID, values }))
  return new compose.Record(module, res)
}

export function deleteRecord(record) {
  return call(() => composeApi.recordDelete({ ...ids(record.module), recordID: record.recordID }))
}

// Corteza reports validation problems as { kind, message, meta: { field } },
// both from the client-side validator and from the API. Messages are often
// i18n keys (e.g. "field:required-field"), so map the known kinds.
const messages = {
  empty: 'This field is required.',
  invalidValue: 'This value is not valid.',
  duplicateValue: 'This value is already used by another record.',
}

export function fieldErrors(list = []) {
  const out = {}
  for (const err of list) {
    const field = err.meta?.field
    if (field && !out[field]) out[field] = messages[err.kind] || err.message
  }
  return out
}

// Client-side check with Corteza's own validator (required fields).
export function validateRecord(record) {
  return fieldErrors(new compose.RecordValidator(record.module).run(record).get())
}

// --- Lookups for IDs shown in the UI ---------------------------------------

// Label of a record as configured on a Record field (labelField option),
// falling back to the related module's first String field.
export function recordLabelField(relatedModule, field) {
  return field.options?.labelField || relatedModule.fields.find((f) => f.kind === 'String')?.name || 'recordID'
}

// Fetches labels for the given record IDs of one module: Map(recordID -> label).
export async function fetchRecordLabels(module, labelField, recordIDs) {
  const wanted = [...new Set(recordIDs.filter((id) => id && id !== NoID))]
  if (!wanted.length) return new Map()
  const { records } = await listRecords(module, {
    query: anyOf(wanted.map((id) => eq('recordID', id))),
    limit: wanted.length,
  })
  return new Map(records.map((r) => [r.recordID, r.values[labelField] || r.recordID]))
}

// Records in `modules` whose Record fields point at `record`, e.g. the tickets
// of a customer: [{ module, field, total }] (only non-zero counts). Rejects if
// any count fails, since a partial answer could hide references.
export async function countReferences(record, modules) {
  const refs = modules.flatMap((m) => m.fields
    .filter((f) => f.kind === 'Record' && f.options?.moduleID === record.moduleID)
    .map((f) => ({ module: m, field: f })))
  const totals = await Promise.all(refs.map(({ module, field }) =>
    listRecords(module, { query: eq(field.name, record.recordID), limit: 1 }).then((res) => res.total)))
  return refs.map((x, i) => ({ ...x, total: totals[i] })).filter((x) => x.total)
}

// User display names, cached for the session: Map(userID -> name).
const userNames = new Map()

export async function fetchUserNames(userIDs) {
  const missing = [...new Set(userIDs.filter((id) => id && id !== NoID && !userNames.has(id)))]
  if (missing.length) {
    const res = await call(() => systemApi.userList({ userID: missing, limit: missing.length }))
    for (const u of res.set || []) userNames.set(u.userID, u.name || u.handle || u.email || u.userID)
  }
  return userNames
}
