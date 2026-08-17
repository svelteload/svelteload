import type { Payload } from 'payload'

type AnyDoc = Record<string, any>

type ProjectMetaLike = {
    pageTypes?: string[]
}

export type LocalizationConfig = {
    locales: string[]
    defaultLocale: string
}

export type RoutableDoc = {
    collection: string
    id: string | number
    updatedAt: string
    status?: string
    localizedPaths: Record<string, string>
}

export function getLocalizationConfig(payload: Payload): LocalizationConfig | null {
    const loc = (payload.config as { localization?: any }).localization
    if (!loc) return null
    const rawLocales = loc.locales as Array<string | { code: string }> | undefined
    const locales = rawLocales
        ?.map((l) => (typeof l === 'string' ? l : l.code))
        .filter(Boolean) as string[] | undefined
    if (!locales || locales.length === 0) return null
    return { locales, defaultLocale: loc.defaultLocale ?? locales[0] }
}

export function getRoutableCollectionSlugs(
    payload: Payload,
    meta: ProjectMetaLike,
): { pages: string; landingBound: string[] } {
    const allSlugs = new Set(payload.config.collections.map((c) => c.slug))
    const landingBound = (meta.pageTypes ?? []).filter(
        (pt) => pt !== 'pages' && allSlugs.has(pt),
    )
    return { pages: 'pages', landingBound }
}

function readLocalizedPaths(doc: AnyDoc, fallbackLocale: string): Record<string, string> {
    const raw = doc.localizedPaths
    if (raw && typeof raw === 'object' && Object.keys(raw).length > 0) {
        return raw as Record<string, string>
    }
    if (typeof doc.path === 'string' && doc.path) {
        return { [fallbackLocale]: doc.path }
    }
    return {}
}

function stripLocalePrefix(pathname: string, locales: string[]): { lang: string | null; path: string } {
    const match = pathname.match(/^\/([a-z]{2})(\/|$)/)
    if (match && locales.includes(match[1])) {
        const lang = match[1]
        const rest = pathname.slice(lang.length + 1) || '/'
        return { lang, path: rest }
    }
    return { lang: null, path: pathname }
}

export async function resolveUrlToDoc(
    payload: Payload,
    meta: ProjectMetaLike,
    pathname: string,
): Promise<{ collection: string; id: string | number; locale?: string } | null> {
    const localization = getLocalizationConfig(payload)
    const { landingBound } = getRoutableCollectionSlugs(payload, meta)

    let lang: string | null = null
    let normalizedPath = pathname
    if (localization && localization.locales.length > 1) {
        const stripped = stripLocalePrefix(pathname, localization.locales)
        lang = stripped.lang
        normalizedPath = stripped.path
    }

    const lookupLocale = lang ?? localization?.defaultLocale ?? null
    const findOpts = (locale: string | null) =>
        locale ? { locale: locale as any } : {}

    const pageResult = await payload.find({
        collection: 'pages' as any,
        where: { path: { equals: normalizedPath } },
        depth: 0,
        limit: 1,
        draft: true,
        overrideAccess: true,
        ...findOpts(lookupLocale),
    })
    const pageDoc = pageResult.docs[0] as { id?: string | number; pageType?: string } | undefined
    if (pageDoc?.id != null && pageDoc.pageType !== '404') {
        return { collection: 'pages', id: pageDoc.id, locale: lang ?? undefined }
    }

    for (const collectionSlug of landingBound) {
        const landingResult = await payload.find({
            collection: 'pages' as any,
            where: { pageType: { equals: collectionSlug } },
            depth: 0,
            limit: 1,
            draft: true,
            overrideAccess: true,
            ...findOpts(lookupLocale),
        })
        const landingDoc = landingResult.docs[0] as { path?: string } | undefined
        const landingPath = landingDoc?.path
        if (!landingPath) continue

        const prefix = landingPath === '/' ? '/' : landingPath + '/'
        if (!normalizedPath.startsWith(prefix)) continue

        const slug = normalizedPath.slice(prefix.length)
        if (!slug || slug.includes('/')) continue

        const docResult = await payload.find({
            collection: collectionSlug as any,
            where: { slug: { equals: slug } },
            depth: 0,
            limit: 1,
            draft: true,
            overrideAccess: true,
            ...findOpts(lookupLocale),
        })
        const doc = docResult.docs[0] as { id?: string | number } | undefined
        if (doc?.id != null) {
            return { collection: collectionSlug, id: doc.id, locale: lang ?? undefined }
        }
    }

    return null
}

export async function enumerateRoutableDocs(
    payload: Payload,
    meta: ProjectMetaLike,
): Promise<RoutableDoc[]> {
    const localization = getLocalizationConfig(payload)
    const fallbackLocale = localization?.defaultLocale ?? 'en'
    const { pages, landingBound } = getRoutableCollectionSlugs(payload, meta)

    const collectionSlugs = [pages, ...landingBound]

    const findOpts = localization ? { locale: 'all' as any } : {}

    const results = await Promise.all(
        collectionSlugs.map((slug) =>
            payload.find({
                collection: slug as any,
                limit: 10000,
                depth: 0,
                ...findOpts,
            }),
        ),
    )

    const docs: RoutableDoc[] = []
    results.forEach((result, i) => {
        const collection = collectionSlugs[i]
        const seen = new Set<string | number>()
        for (const raw of result.docs as AnyDoc[]) {
            if (raw.id == null || seen.has(raw.id)) continue
            if (collection === 'pages' && (raw as { pageType?: string }).pageType === '404') continue
            seen.add(raw.id)
            const localizedPaths = readLocalizedPaths(raw, fallbackLocale)
            if (Object.keys(localizedPaths).length === 0) continue
            docs.push({
                collection,
                id: raw.id,
                updatedAt: raw.updatedAt,
                status: typeof raw._status === 'string' ? raw._status : undefined,
                localizedPaths,
            })
        }
    })

    return docs
}
