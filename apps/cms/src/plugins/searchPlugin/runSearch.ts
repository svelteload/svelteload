import type { Payload } from 'payload'

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

function tsqueryTokens(q: string): string[] {
  return q
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}_]/gu, ''))
    .filter(Boolean)
    .map((w) => `${w}:*`)
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => '\\' + m)
}

export async function runSearch(
  payload: Payload,
  params: {
    query: string
    locale: string
    type?: string
    limit?: number
    offset?: number
  },
): Promise<SearchResponse> {
  const { query, locale, type, limit = 20, offset = 0 } = params
  const trimmed = query.trim()

  if (!trimmed) {
    return { query: '', locale, results: [], totalHits: 0, byCollection: {} }
  }

  const pool = (payload.db as unknown as { pool: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> } }).pool

  const tokens = tsqueryTokens(trimmed)
  const andTsq = tokens.join(' & ')
  const orTsq = tokens.join(' | ')
  const phraseTsq = tokens.join(' <-> ')
  const likePattern = `%${escapeLike(trimmed)}%`

  const collectionFilter = type ? `AND si.collection = $7` : ''
  const countParams: unknown[] = [orTsq, likePattern]
  const mainParams: unknown[] = [
    andTsq,
    likePattern,
    trimmed,
    locale,
    orTsq,
    phraseTsq,
    ...(type ? [type] : []),
    limit,
    offset,
  ]

  const countSql = `
    WITH q AS (
      SELECT
        CASE WHEN length($1) = 0 THEN NULL::tsquery ELSE to_tsquery('simple', $1) END AS tsq_or
    )
    SELECT
      collection,
      COUNT(DISTINCT doc_id)::int AS n
    FROM search.search_index, q
    WHERE (q.tsq_or IS NOT NULL AND tsv @@ q.tsq_or) OR raw_text ILIKE $2
    GROUP BY collection
  `

  const limitIdx = type ? 8 : 7
  const offsetIdx = type ? 9 : 8

  const mainSql = `
    WITH q AS (
      SELECT
        CASE WHEN length($1) = 0 THEN NULL::tsquery ELSE to_tsquery('simple', $1) END AS tsq_and,
        CASE WHEN length($5) = 0 THEN NULL::tsquery ELSE to_tsquery('simple', $5) END AS tsq_or,
        CASE WHEN length($6) = 0 THEN NULL::tsquery ELSE to_tsquery('simple', $6) END AS tsq_phrase
    ),
    scored AS (
      SELECT
        si.collection,
        si.doc_id,
        si.locale,
        si.title,
        si.url,
        si.raw_text,
        CASE WHEN si.raw_text ILIKE $2 THEN 1 ELSE 0 END AS has_phrase,
        CASE WHEN q.tsq_and IS NOT NULL AND si.tsv @@ q.tsq_and THEN 1 ELSE 0 END AS has_and,
        (
          (CASE WHEN si.title IS NOT NULL AND LOWER(si.title) = LOWER($3) THEN 1500.0 ELSE 0 END)
          + (CASE WHEN si.title IS NOT NULL AND si.title ILIKE $2 THEN 500.0 ELSE 0 END)
          + (CASE WHEN si.title IS NOT NULL AND q.tsq_and IS NOT NULL AND to_tsvector('simple', si.title) @@ q.tsq_and THEN 100.0 ELSE 0 END)
          + (CASE WHEN si.raw_text ILIKE $2 THEN 100.0 ELSE 0 END)
          + (CASE WHEN q.tsq_and IS NOT NULL AND si.tsv @@ q.tsq_and THEN 20.0 ELSE 0 END)
          + (COALESCE(ts_rank_cd(si.tsv, q.tsq_and), 0) * 10.0)
          + (COALESCE(ts_rank_cd(si.tsv, q.tsq_or), 0) * 5.0)
          + similarity(si.raw_text, $3)
        ) AS score
      FROM search.search_index si, q
      WHERE
        (q.tsq_or IS NOT NULL AND si.tsv @@ q.tsq_or)
        OR si.raw_text ILIKE $2
    ),
    best AS (
      SELECT DISTINCT ON (si.collection, si.doc_id)
        si.collection,
        si.doc_id,
        si.locale AS display_locale,
        si.title,
        si.url,
        si.raw_text,
        si.has_phrase,
        si.score
      FROM scored si
      WHERE 1 = 1 ${collectionFilter}
      ORDER BY si.collection, si.doc_id,
        CASE WHEN si.locale = $4 THEN 0 ELSE 1 END,
        si.score DESC,
        si.locale
    )
    SELECT
      collection,
      doc_id,
      display_locale,
      title,
      url,
      COALESCE(
        CASE
          WHEN has_phrase = 1 AND (SELECT tsq_phrase FROM q) IS NOT NULL THEN
            ts_headline(
              'simple',
              raw_text,
              (SELECT tsq_phrase FROM q),
              'MaxWords=20, MinWords=5, MaxFragments=1, ShortWord=0, HighlightAll=false, StartSel=<<HL>>, StopSel=<</HL>>'
            )
          ELSE
            ts_headline(
              'simple',
              raw_text,
              (SELECT tsq_or FROM q),
              'MaxWords=20, MinWords=5, MaxFragments=2, ShortWord=0, HighlightAll=false, StartSel=<<HL>>, StopSel=<</HL>>'
            )
        END,
        substring(raw_text FROM 1 FOR 200)
      ) AS snippet,
      score AS rank
    FROM best
    ORDER BY score DESC, collection, doc_id
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `

  const [countRes, mainRes] = await Promise.all([
    pool.query(countSql, countParams),
    pool.query(mainSql, mainParams),
  ])

  const byCollection: Record<string, number> = {}
  let totalHits = 0
  for (const row of countRes.rows as Array<{ collection: string; n: number }>) {
    byCollection[row.collection] = row.n
    totalHits += row.n
  }

  const results: SearchResult[] = (mainRes.rows as Array<Record<string, unknown>>).map((r) => ({
    collection: String(r.collection),
    docId: String(r.doc_id),
    displayLocale: String(r.display_locale),
    title: (r.title as string | null) ?? null,
    url: (r.url as string | null) ?? null,
    snippet: String(r.snippet ?? ''),
    rank: Number(r.rank ?? 0),
  }))

  return { query: trimmed, locale, results, totalHits, byCollection }
}
