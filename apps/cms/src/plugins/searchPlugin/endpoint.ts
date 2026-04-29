import type { Endpoint } from 'payload'
import { backfillAll, reindexAll } from './hooks'
import { getUserRole } from '@cms/access/roles'

export const reindexSearchEndpoint = (opts: { extraSkipKeys?: string[] } = {}): Endpoint => ({
  path: '/reindex-search',
  method: 'post',
  handler: async (req) => {
    if (!req.user || getUserRole(req.user) !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    const counts = await reindexAll(req.payload, { extraSkipKeys: opts.extraSkipKeys })
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    return Response.json({ success: true, total, byCollection: counts })
  },
})

export const backfillSearchUrlsEndpoint: Endpoint = {
  path: '/backfill-search-urls',
  method: 'post',
  handler: async (req) => {
    if (!req.user || getUserRole(req.user) !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    const counts = await backfillAll(req.payload)
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    return Response.json({ success: true, total, byCollection: counts })
  },
}
