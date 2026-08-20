import type { Payload } from 'payload'

type Pool = { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> }

let schemaReady: Promise<void> | null = null

// Rows written before `status` existed carry NULL, and every query treats an unknown
// status as unpublished. Resolve them from the collections themselves rather than
// defaulting the column, which would mark existing drafts as published.
async function backfillStatus(payload: Payload, pool: Pool): Promise<void> {
  const pending = await pool.query(
    `SELECT DISTINCT collection FROM search.search_index WHERE status IS NULL`,
  )
  if (pending.rows.length === 0) return

  for (const { collection } of pending.rows as Array<{ collection: string }>) {
    const config = payload.config.collections.find((c) => c.slug === collection)
    const versions = config?.versions
    if (!versions || typeof versions !== 'object' || !versions.drafts) continue

    const drafts = await payload.find({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      collection: collection as any,
      where: { _status: { equals: 'draft' } },
      limit: 10000,
      depth: 0,
      overrideAccess: true,
    })
    const ids = drafts.docs.map((d) => String((d as { id: string | number }).id))
    if (ids.length === 0) continue

    await pool.query(
      `UPDATE search.search_index SET status = 'draft' WHERE collection = $1 AND doc_id = ANY($2::text[])`,
      [collection, ids],
    )
  }

  await pool.query(`UPDATE search.search_index SET status = 'published' WHERE status IS NULL`)
}

export function ensureSearchSchema(payload: Payload): Promise<void> {
  if (schemaReady) return schemaReady

  schemaReady = (async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = (payload.db as any)?.pool
    if (!pool || typeof pool.query !== 'function') {
      throw new Error(
        '[search] payload.db.pool is not available — the postgres adapter is required.',
      )
    }

    // Isolate the search table in its own Postgres schema so Payload's
    // Drizzle push (which only manages `public`) never tries to drop it.
    await pool.query(`CREATE SCHEMA IF NOT EXISTS search`)
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS search.search_index (
        id          BIGSERIAL PRIMARY KEY,
        collection  TEXT NOT NULL,
        doc_id      TEXT NOT NULL,
        locale      TEXT NOT NULL,
        title       TEXT,
        url         TEXT,
        raw_text    TEXT NOT NULL,
        tsv         TSVECTOR NOT NULL,
        status      TEXT,
        updated_at  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (collection, doc_id, locale)
      )
    `)

    await pool.query(
      `ALTER TABLE search.search_index ADD COLUMN IF NOT EXISTS status TEXT`,
    )

    await backfillStatus(payload, pool)

    await pool.query(
      `CREATE INDEX IF NOT EXISTS search_index_tsv_idx ON search.search_index USING GIN (tsv)`,
    )
    await pool.query(
      `CREATE INDEX IF NOT EXISTS search_index_trgm_idx ON search.search_index USING GIN (raw_text gin_trgm_ops)`,
    )
    await pool.query(
      `CREATE INDEX IF NOT EXISTS search_index_lookup_idx ON search.search_index (collection, doc_id)`,
    )
  })().catch((err) => {
    schemaReady = null
    throw err
  })

  return schemaReady
}

export function resetSchemaCache(): void {
  schemaReady = null
}
