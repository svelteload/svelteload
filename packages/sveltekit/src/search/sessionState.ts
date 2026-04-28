const HIGHLIGHT_KEY = '__search_highlight'
const HANDOFF_KEY = '__search_handoff'

export interface HighlightPayload {
  query: string
  matchedText?: string
}

export interface HandoffPayload {
  query: string
}

export function stashHighlight(payload: HighlightPayload): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(HIGHLIGHT_KEY, JSON.stringify(payload))
  } catch {
    /* quota — ignore */
  }
}

export function takeHighlight(): HighlightPayload | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(HIGHLIGHT_KEY)
    if (!raw) return null
    sessionStorage.removeItem(HIGHLIGHT_KEY)
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const obj = parsed as Record<string, unknown>
    if (typeof obj.query !== 'string') return null
    const matchedText = typeof obj.matchedText === 'string' ? obj.matchedText : undefined
    return { query: obj.query, matchedText }
  } catch {
    return null
  }
}

export function stashHandoff(payload: HandoffPayload): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

export function takeHandoff(): HandoffPayload | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY)
    if (!raw) return null
    sessionStorage.removeItem(HANDOFF_KEY)
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const obj = parsed as Record<string, unknown>
    if (typeof obj.query !== 'string') return null
    return { query: obj.query }
  } catch {
    return null
  }
}
