import type { CollectionBeforeChangeHook } from 'payload'
import { generateSlugFromName } from './generateSlugFromName'

type Config = {
    /** Default 'path'. Source-of-truth field on the Pages collection (must be `localized: true` in localized projects). */
    pathFieldName?: string
    /** Default 'name'. Field used to auto-derive the path when empty or ending with `/`. Set null to disable. */
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

export const buildPagesPathHook = (cfg: Config = {}): CollectionBeforeChangeHook => async ({ data, req, originalDoc, collection }) => {
    if (req.context?.bypassHooks) return data

    const collectionSlug = collection.slug
    const docId = originalDoc?.id ?? null
    const pathFieldName = cfg.pathFieldName ?? 'path'
    const nameFieldName = cfg.nameFieldName === undefined ? 'name' : cfg.nameFieldName

    const localization = getLocalization(req)
    const currentLocale = (req.locale && req.locale !== 'all') ? req.locale : (localization?.defaultLocale ?? 'en')

    let candidate = ((data[pathFieldName] ?? '') as string).trim()

    if (!candidate) {
        if (nameFieldName && data[nameFieldName]) {
            candidate = `/${generateSlugFromName(data[nameFieldName])}`
        } else {
            throw new Error(`Cannot save ${collectionSlug}: provide a ${pathFieldName} or a ${nameFieldName ?? 'name'}.`)
        }
    } else if (candidate !== '/' && candidate.endsWith('/') && nameFieldName && data[nameFieldName]) {
        candidate = candidate + generateSlugFromName(data[nameFieldName])
    }

    if (!candidate.startsWith('/')) {
        throw new Error(`${pathFieldName} must start with /`)
    }

    const findConflictRaw = async (path: string): Promise<boolean> => {
        const localesToCheck = localization?.locales ?? [null]
        const orClauses = localesToCheck.map((l) => ({
            [l ? `${pathFieldName}.${l}` : pathFieldName]: { equals: path },
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

    if (candidate === '/' && nameFieldName && data[nameFieldName] && (await findConflictRaw('/'))) {
        candidate = `/${generateSlugFromName(data[nameFieldName])}`
    }

    if (await findConflictRaw(candidate)) {
        const base = candidate
        let counter = 2
        while (counter <= 100) {
            candidate = `${base}-${counter}`
            if (!(await findConflictRaw(candidate))) break
            counter++
        }
        if (counter > 100) {
            throw new Error(`Could not generate unique ${pathFieldName} for "${base}" after 100 attempts`)
        }
    }

    data[pathFieldName] = candidate

    const allPaths: Record<string, string> = {}
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
            const pathField = (existing as any)[pathFieldName]
            if (pathField && typeof pathField === 'object') {
                for (const [locale, p] of Object.entries(pathField)) {
                    if (typeof p === 'string' && p) allPaths[locale] = p
                }
            } else if (typeof pathField === 'string' && pathField) {
                allPaths[currentLocale] = pathField
            }
        } catch (_) {}
    }
    allPaths[currentLocale] = candidate

    ;(data as any).localizedPaths = allPaths

    return data
}
