import type { CollectionBeforeChangeHook } from 'payload'
import { generateSlugFromName } from './generateSlugFromName'

type Config = {
    /** Pages collection's `pageType` value that marks the landing page for this collection. */
    pageType: string
    /** Default 'slug'. Field used as the per-locale URL slug (must be `localized: true` in localized projects). */
    slugFieldName?: string
    /** Default 'name'. Field used to auto-derive the slug when empty. Set null to disable. */
    nameFieldName?: string | null
}

type Localization = { locales: string[]; defaultLocale: string }

const getLocalization = (req: any): Localization | null => {
    const loc = (req.payload.config as { localization?: any }).localization
    if (!loc) return null
    const rawLocales = loc.locales as Array<string | { code: string }> | undefined
    const locales = rawLocales?.map((l) => (typeof l === 'string' ? l : l.code)).filter(Boolean) as string[] | undefined
    if (!locales || locales.length === 0) return null
    return { locales, defaultLocale: loc.defaultLocale ?? locales[0] }
}

const getLanding = async (req: any, pageType: string): Promise<any> => {
    const ctx = (req.context ??= {} as any)
    if (!ctx.svelteloadLandingCache) ctx.svelteloadLandingCache = new Map<string, Promise<any>>()
    const cache: Map<string, Promise<any>> = ctx.svelteloadLandingCache
    if (!cache.has(pageType)) {
        cache.set(
            pageType,
            req.payload
                .find({
                    collection: 'pages' as any,
                    where: { pageType: { equals: pageType } },
                    depth: 0,
                    limit: 1,
                    locale: 'all' as any,
                    draft: true,
                    overrideAccess: true,
                })
                .then((r: any) => r.docs[0] ?? null),
        )
    }
    return cache.get(pageType)
}

const normalizePrefix = (raw: string): string => {
    if (raw === '/' || raw === '') return ''
    return raw.endsWith('/') ? raw.slice(0, -1) : raw
}

export const buildLandingBoundPathsHook = (cfg: Config): CollectionBeforeChangeHook => async ({ data, req, originalDoc, collection }) => {
    if (req.context?.bypassHooks) return data

    const collectionSlug = collection.slug
    const docId = originalDoc?.id ?? null
    const slugFieldName = cfg.slugFieldName ?? 'slug'
    const nameFieldName = cfg.nameFieldName === undefined ? 'name' : cfg.nameFieldName

    const localization = getLocalization(req)
    const currentLocale = (req.locale && req.locale !== 'all') ? req.locale : (localization?.defaultLocale ?? 'en')

    if (nameFieldName && !data[slugFieldName] && data[nameFieldName]) {
        data[slugFieldName] = generateSlugFromName(data[nameFieldName])
    }

    const allSlugs: Record<string, string> = {}
    if (docId) {
        try {
            const existing = await req.payload.findByID({
                collection: collectionSlug as any,
                id: docId,
                locale: 'all' as any,
                depth: 0,
                draft: true,
                overrideAccess: true,
            })
            const slugField = (existing as any)[slugFieldName]
            if (slugField && typeof slugField === 'object') {
                for (const [locale, slug] of Object.entries(slugField)) {
                    if (typeof slug === 'string' && slug) allSlugs[locale] = slug
                }
            } else if (typeof slugField === 'string' && slugField) {
                allSlugs[currentLocale] = slugField
            }
        } catch (_) {}
    }
    if (slugFieldName in data) {
        const newSlug = data[slugFieldName]
        if (typeof newSlug === 'string' && newSlug) {
            allSlugs[currentLocale] = newSlug
        } else {
            delete allSlugs[currentLocale]
        }
    }

    const landingDoc = await getLanding(req, cfg.pageType)
    if (!landingDoc) {
        throw new Error(
            `Cannot save ${collectionSlug}: create a Page with pageType="${cfg.pageType}" first. ` +
                `${collectionSlug} documents need a landing page to derive their URL prefix from.`,
        )
    }

    const prefixes: Record<string, string> = {}
    const pathField = (landingDoc as any).path
    if (pathField && typeof pathField === 'object') {
        for (const [locale, p] of Object.entries(pathField)) {
            if (typeof p === 'string' && p) prefixes[locale] = normalizePrefix(p)
        }
    } else if (typeof pathField === 'string' && pathField) {
        prefixes[currentLocale] = normalizePrefix(pathField)
    }

    if (allSlugs[currentLocale] && prefixes[currentLocale] !== undefined) {
        const conflictExists = async (path: string): Promise<boolean> => {
            const localesToCheck = localization?.locales ?? [currentLocale]
            const orClauses = localesToCheck.map((l) => ({
                [`localizedPaths.${l}`]: { equals: path },
            }))
            const result = await req.payload.find({
                collection: collectionSlug as any,
                where: {
                    and: [
                        ...(docId ? [{ id: { not_equals: docId } }] : []),
                        orClauses.length > 1 ? { or: orClauses } : orClauses[0],
                    ],
                },
                limit: 1,
                depth: 0,
                draft: true,
                overrideAccess: true,
            })
            return result.docs.length > 0
        }

        const proposedPath = `${prefixes[currentLocale]}/${allSlugs[currentLocale]}`
        if (await conflictExists(proposedPath)) {
            const base = allSlugs[currentLocale]
            let counter = 2
            while (counter <= 100) {
                const candidate = `${base}-${counter}`
                if (!(await conflictExists(`${prefixes[currentLocale]}/${candidate}`))) {
                    allSlugs[currentLocale] = candidate
                    data[slugFieldName] = candidate
                    break
                }
                counter++
            }
            if (counter > 100) {
                throw new Error(`Could not generate unique slug for "${base}" after 100 attempts`)
            }
        }
    }

    const localizedPaths: Record<string, string> = {}
    for (const [locale, slug] of Object.entries(allSlugs)) {
        const prefix = prefixes[locale]
        if (prefix === undefined) continue
        localizedPaths[locale] = `${prefix}/${slug}`
    }
    ;(data as any).localizedPaths = localizedPaths

    return data
}
