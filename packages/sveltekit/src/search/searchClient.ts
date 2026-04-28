export interface SearchResult {
  collection: string
  docId: string
  displayLocale: string
  title: string | null
  url: string | null
  snippet: string
  rank: number
}

export interface SearchResponse {
  query: string
  locale: string
  results: SearchResult[]
  totalHits: number
  byCollection: Record<string, number>
}

export async function searchQuery(params: {
  query: string
  locale?: string
  type?: string
  limit?: number
  offset?: number
  signal?: AbortSignal
}): Promise<SearchResponse> {
  const { query, locale = 'en', type, limit, offset, signal } = params
  const search = new URLSearchParams({ q: query, locale })
  if (type) search.set('type', type)
  if (limit != null) search.set('limit', String(limit))
  if (offset != null) search.set('offset', String(offset))

  const res = await fetch(`/api/search?${search.toString()}`, { signal })
  if (!res.ok) throw new Error(`Search failed: ${res.status}`)
  return (await res.json()) as SearchResponse
}
