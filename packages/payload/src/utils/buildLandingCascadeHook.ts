import type { CollectionAfterChangeHook } from 'payload'

export type LandingBinding = {
    /** `pageType` value on the Pages document that acts as this collection's landing page. */
    pageType: string
    /** Collection whose paths are derived from that landing page's path. */
    collection: string
}

const MAX_CHILDREN = 1000

const firstLocalisedValue = (value: unknown): { locale?: string; slug?: string } => {
    if (typeof value === 'string' && value) return { slug: value }
    if (value && typeof value === 'object') {
        for (const [locale, slug] of Object.entries(value as Record<string, unknown>)) {
            if (typeof slug === 'string' && slug) return { locale, slug }
        }
    }
    return {}
}

export const buildLandingCascadeHook = (bindings: LandingBinding[]): CollectionAfterChangeHook =>
    async ({ doc, previousDoc, req }) => {
        if (req.context?.bypassHooks) return doc
        if (req.context?.landingCascade) return doc

        const binding = bindings.find((entry) => entry.pageType === doc?.pageType)
        if (!binding) return doc

        const before = JSON.stringify(previousDoc?.localizedPaths ?? {})
        const after = JSON.stringify(doc?.localizedPaths ?? {})
        if (before === after) return doc

        try {
            const children = await req.payload.find({
                collection: binding.collection as never,
                limit: MAX_CHILDREN,
                depth: 0,
                draft: true,
                locale: 'all' as never,
                overrideAccess: true,
            })

            let touched = 0

            for (const child of children.docs as Array<Record<string, any>>) {
                const { locale, slug } = firstLocalisedValue(child.slug)
                if (!slug) continue

                const wasPublished = child._status === 'published'

                await req.payload.update({
                    collection: binding.collection as never,
                    id: child.id,
                    ...(locale ? { locale: locale as never } : {}),
                    draft: !wasPublished,
                    data: { slug, _status: wasPublished ? 'published' : 'draft' } as never,
                    overrideAccess: true,
                    context: { landingCascade: true },
                })

                touched++
            }

            req.payload.logger.info(
                { collection: binding.collection, touched, total: children.totalDocs },
                `Landing page "${binding.pageType}" moved. Recomputed child paths and recorded redirects.`,
            )

            if (children.totalDocs > children.docs.length) {
                req.payload.logger.warn(
                    { collection: binding.collection, handled: children.docs.length, total: children.totalDocs },
                    `More than ${MAX_CHILDREN} documents inherit this landing path. The rest still hold their old URLs and need a manual resave.`,
                )
            }
        } catch (err) {
            req.payload.logger.error(
                { err, collection: binding.collection },
                'Landing cascade failed. Child URLs may still point at the old landing path.',
            )
        }

        return doc
    }
