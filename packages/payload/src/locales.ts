export type LocaleDefinition = {
    code: string
    label: string
    dateLocale: string
}

export type LocaleSet<T extends readonly LocaleDefinition[]> = {
    SUPPORTED_LOCALES: T
    DEFAULT_LOCALE: string
    SUPPORTED_LANGUAGE_CODES: string[]
    dateLocaleFor: (code: string | undefined | null) => string
}

export function buildLocales<T extends readonly LocaleDefinition[]>(
    locales: T,
    defaultLocale: T[number]['code'],
): LocaleSet<T> {
    const fallback = locales.find((l) => l.code === defaultLocale)
    if (!fallback) {
        throw new Error(`Default locale "${defaultLocale}" is missing from the supported locale list.`)
    }

    return {
        SUPPORTED_LOCALES: locales,
        DEFAULT_LOCALE: defaultLocale,
        SUPPORTED_LANGUAGE_CODES: locales.map((l) => l.code),
        dateLocaleFor: (code) => locales.find((l) => l.code === code)?.dateLocale ?? fallback.dateLocale,
    }
}
