// Display helpers for module field values (compose.ModuleField + raw value).

export function selectOptions(field) {
  return (field.options?.options || []).map((o) =>
    typeof o === 'string' ? { value: o, text: o } : { value: o.value, text: o.text || o.value },
  )
}

// --- Select option colours --------------------------------------------------

// Corteza lets admins colour Select options (options[].style). Badges always
// show the option text, so colour is never the only signal; a configured
// pair is used only when it meets WCAG AA (4.5:1), otherwise the neutral badge.
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

function luminance(hex) {
  let h = hex.slice(1)
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const [r, g, b] = h.match(/../g).map((x) => parseInt(x, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

export function optionStyle(field, value) {
  const style = (field.options?.options || []).find((o) => o.value === value)?.style
  const fg = style?.textColor
  const bg = style?.backgroundColor
  if (!HEX.test(fg || '') || !HEX.test(bg || '') || contrastRatio(fg, bg) < 4.5) return undefined
  return { color: fg, backgroundColor: bg, borderColor: bg }
}

export function isTruthy(value) {
  return value === '1' || value === 'true' || value === true
}

// `labels` maps related record IDs to their labels (for Record fields).
export function formatValue(field, value, labels) {
  if (value === undefined || value === null || value === '') return ''
  if (Array.isArray(value)) return value.map((v) => formatValue(field, v, labels)).filter(Boolean).join(', ')

  switch (field.kind) {
    case 'Select':
      return selectOptions(field).find((o) => o.value === value)?.text || value
    case 'Bool':
      return isTruthy(value) ? field.options?.trueLabel || 'Yes' : field.options?.falseLabel || 'No'
    case 'Record':
      // Labels were looked up; no label means the record is gone (or hidden from us).
      return labels ? labels.get(value) || 'Missing record' : value
    case 'DateTime': {
      const o = field.options || {}
      if (o.onlyTime) return value
      const d = new Date(value)
      if (Number.isNaN(d.getTime())) return value
      return o.onlyDate ? d.toLocaleDateString() : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    }
    default:
      return value
  }
}

export function formatDate(d) {
  return d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''
}
