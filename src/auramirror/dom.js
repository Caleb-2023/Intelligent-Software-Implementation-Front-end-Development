export function $(selector, scope = document) {
  return scope.querySelector(selector)
}

export function $$(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector))
}

export function ensureMeta(name, content) {
  if (!name) return null

  let meta = document.head.querySelector(`meta[name="${name}"]`)

  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', name)
    document.head.appendChild(meta)
  }

  meta.setAttribute('content', content)
  return meta
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
