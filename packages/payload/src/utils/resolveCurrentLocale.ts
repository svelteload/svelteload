export type Localization = { locales: string[]; defaultLocale: string }

export const getLocalization = (req: any): Localization | null => {
    const loc = (req.payload.config as { localization?: any }).localization
    if (!loc) return null
    const rawLocales = loc.locales as Array<string | { code: string }> | undefined
    const locales = rawLocales?.map((l) => (typeof l === 'string' ? l : l.code)).filter(Boolean) as string[] | undefined
    if (!locales || locales.length === 0) return null
    return { locales, defaultLocale: loc.defaultLocale ?? locales[0] }
}

/**
 * Returns the locale to key `localizedPaths` under. Non-localized projects
 * always get 'en' so single-language sites still produce `{ en: "/path" }`,
 * which is what the search index, sitemap, and routable-url helpers expect.
 *
 * On localized projects we trust `req.locale` only if it's one of the
 * configured codes; the admin UI can send the literal string "undefined"
 * when its locale switcher hasn't initialised, which would otherwise
 * become a bogus key.
 */
export const resolveCurrentLocale = (req: any, localization: Localization | null): string => {
    if (!localization) return 'en'
    const reqLocale = req.locale
    if (typeof reqLocale === 'string' && reqLocale && localization.locales.includes(reqLocale)) {
        return reqLocale
    }
    return localization.defaultLocale
}
