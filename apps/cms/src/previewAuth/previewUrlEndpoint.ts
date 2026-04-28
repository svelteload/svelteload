import type { Endpoint } from 'payload'

/**
 * GET /api/preview-url?collection=<slug>&id=<id>
 *
 * Returns the same URL that Payload's live-preview iframe would use for this
 * document, including the calling user's preview_key. Lets us render a
 * "Copy preview URL" button in the admin without duplicating the URL-building
 * logic that already lives in the project's `livePreview.url` callback.
 *
 * Requires an authenticated Payload user. The mint helper inside
 * `livePreview.url` will reuse the user's existing token (no explosion of
 * keys from repeated clicks).
 */
export const previewUrlEndpoint: Endpoint = {
  path: '/preview-url',
  method: 'get',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const collectionSlug = typeof req.query?.collection === 'string' ? req.query.collection : ''
    const id = typeof req.query?.id === 'string' ? req.query.id : ''
    if (!collectionSlug || !id) {
      return Response.json({ error: 'Missing collection or id' }, { status: 400 })
    }

    const collectionConfig = req.payload.collections[collectionSlug]?.config
    if (!collectionConfig) {
      return Response.json({ error: `Unknown collection: ${collectionSlug}` }, { status: 404 })
    }

    const urlBuilder = req.payload.config.admin?.livePreview?.url
    if (typeof urlBuilder !== 'function') {
      return Response.json({ error: 'livePreview.url is not configured' }, { status: 500 })
    }

    let doc: Record<string, unknown>
    try {
      doc = await req.payload.findByID({
        collection: collectionSlug as any,
        id,
        depth: 0,
        draft: true,
        overrideAccess: true,
      }) as Record<string, unknown>
    } catch {
      return Response.json({ error: 'Document not found' }, { status: 404 })
    }

    try {
      const url = await urlBuilder({
        data: doc,
        collectionConfig,
        req,
        locale: req.locale,
        payload: req.payload,
      } as any)
      return Response.json({ url })
    } catch (err) {
      req.payload.logger.error({ err }, '[preview-url] failed to build URL')
      const message = err instanceof Error ? err.message : 'Failed to build preview URL'
      return Response.json({ error: message }, { status: 500 })
    }
  },
}
