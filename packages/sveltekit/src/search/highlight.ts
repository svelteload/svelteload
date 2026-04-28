const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'INPUT', 'TEXTAREA', 'SELECT'])
const MAX_HITS = 40

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.;:!?()[\]{}"'\-–—/\\]+/)
    .filter((w) => w.length >= 3)
}

function findMatches(root: Node, needle: string): Array<{ node: Text; start: number; end: number }> {
  const lower = needle.toLowerCase()
  if (!lower) return []

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT
      if (parent.closest('[data-no-search-highlight]')) return NodeFilter.FILTER_REJECT
      if (parent.closest('.search-hit')) return NodeFilter.FILTER_REJECT
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const hits: Array<{ node: Text; start: number; end: number }> = []
  let current: Node | null = walker.nextNode()
  while (current && hits.length < MAX_HITS) {
    const textNode = current as Text
    const value = textNode.nodeValue ?? ''
    const valueLower = value.toLowerCase()
    let from = 0
    while (from < valueLower.length && hits.length < MAX_HITS) {
      const idx = valueLower.indexOf(lower, from)
      if (idx === -1) break
      hits.push({ node: textNode, start: idx, end: idx + lower.length })
      from = idx + lower.length
    }
    current = walker.nextNode()
  }
  return hits
}

function wrapHits(hits: Array<{ node: Text; start: number; end: number }>): HTMLElement[] {
  const wrapped: HTMLElement[] = []
  const byNode = new Map<Text, Array<{ start: number; end: number }>>()
  for (const h of hits) {
    const arr = byNode.get(h.node) ?? []
    arr.push({ start: h.start, end: h.end })
    byNode.set(h.node, arr)
  }

  for (const [node, ranges] of byNode) {
    ranges.sort((a, b) => a.start - b.start)
    const parent = node.parentNode
    if (!parent) continue
    const value = node.nodeValue ?? ''
    const frag = document.createDocumentFragment()
    let cursor = 0
    for (const { start, end } of ranges) {
      if (start < cursor) continue
      if (start > cursor) frag.appendChild(document.createTextNode(value.slice(cursor, start)))
      const mark = document.createElement('mark')
      mark.className = 'search-hit'
      mark.textContent = value.slice(start, end)
      frag.appendChild(mark)
      wrapped.push(mark)
      cursor = end
    }
    if (cursor < value.length) frag.appendChild(document.createTextNode(value.slice(cursor)))
    parent.replaceChild(frag, node)
  }

  return wrapped
}

function unwrapHits(marks: HTMLElement[]) {
  for (const mark of marks) {
    const parent = mark.parentNode
    if (!parent) continue
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
    parent.normalize()
  }
}

export interface HighlightInput {
  query: string
  matchedText?: string
}

export function highlightInDom(input: HighlightInput): () => void {
  if (typeof document === 'undefined') return () => undefined

  const body = document.body
  if (!body) return () => undefined

  let hits = findMatches(body, input.query)

  if (hits.length === 0 && input.matchedText) {
    const tokens = tokenize(input.matchedText)
      .sort((a, b) => b.length - a.length)
      .slice(0, 4)
    for (const token of tokens) {
      const more = findMatches(body, token)
      hits.push(...more)
      if (hits.length >= MAX_HITS) break
    }
  }

  if (hits.length === 0) return () => undefined

  const wrapped = wrapHits(hits.slice(0, MAX_HITS))
  if (wrapped.length === 0) return () => undefined

  wrapped[0].scrollIntoView({ behavior: 'smooth', block: 'center' })

  let cleared = false
  const cleanup = () => {
    if (cleared) return
    cleared = true
    unwrapHits(wrapped)
  }

  window.setTimeout(cleanup, 3100)

  return cleanup
}
