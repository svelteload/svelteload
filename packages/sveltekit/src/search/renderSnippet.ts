export function renderSnippet(raw: string): string {
  if (!raw) return ''
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .replace(/&lt;&lt;HL&gt;&gt;/g, '<mark class="search-hit-inline">')
    .replace(/&lt;&lt;\/HL&gt;&gt;/g, '</mark>')
}

export function stripMarkers(raw: string): string {
  return raw.replace(/<<\/?HL>>/g, '')
}
