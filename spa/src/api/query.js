// Builders for Corteza's record filter language (SQL-like, e.g.
// "status = 'open' OR subject LIKE '%printer%'"). Field names come from the
// module schema; only values are user input, and they always go through quote().

// Text literals are single-quoted with backslash escapes: \' and \\. Doubling
// the quote ('') does not escape it: the literal ends there and the rest of
// the query is silently dropped.
export function quote(value) {
  return `'${String(value).replace(/[\\']/g, '\\$&')}'`
}

export function eq(field, value) {
  return `${field} = ${quote(value)}`
}

// Case-insensitive substring match. % and _ are LIKE wildcards, so they (and
// the escape character itself) are escaped to match literally.
export function contains(field, term) {
  return `${field} LIKE ${quote(`%${String(term).replace(/[\\%_]/g, '\\$&')}%`)}`
}

export function anyOf(conditions) {
  return conditions.filter(Boolean).join(' OR ')
}
