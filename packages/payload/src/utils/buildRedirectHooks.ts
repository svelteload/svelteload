import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'
import { dropPendingRedirects, promotePendingRedirects, stagePendingRedirect } from './redirectStore'

export const redirectStagingHook: CollectionAfterChangeHook = async ({ doc, previousDoc, req, collection }) => {
    if (req.context?.bypassHooks) return doc

    const docId = doc?.id
    if (!docId) return doc

    const collectionSlug = collection.slug
    const previousPaths = (previousDoc?.localizedPaths ?? {}) as Record<string, unknown>
    const nextPaths = (doc?.localizedPaths ?? {}) as Record<string, unknown>

    try {
        for (const [locale, to] of Object.entries(nextPaths)) {
            const from = previousPaths[locale]
            if (typeof from !== 'string' || typeof to !== 'string') continue
            if (!from || !to || from === to) continue
            await stagePendingRedirect({ payload: req.payload, collectionSlug, docId, locale, from, to })
        }

        if (doc?._status === 'published') {
            await promotePendingRedirects({ payload: req.payload, collectionSlug, docId })
        }
    } catch (err) {
        req.payload.logger.error(
            { err, collection: collectionSlug, id: docId },
            'Redirect staging failed. The document saved; its URL redirect was not recorded.',
        )
    }

    return doc
}

export const redirectCleanupHook: CollectionAfterDeleteHook = async ({ doc, id, req, collection }) => {
    if (req.context?.bypassHooks) return doc

    try {
        await dropPendingRedirects({ payload: req.payload, collectionSlug: collection.slug, docId: id })
    } catch (err) {
        req.payload.logger.error({ err, collection: collection.slug, id }, 'Failed to clear pending redirects for deleted document.')
    }

    return doc
}
