export type TranslationsGlobal =
    | {
          common?: Record<string, unknown> | null
          entries?: Array<{ key?: string | null; value?: string | null }> | null
      }
    | null
    | undefined

export function flattenTranslations(global: TranslationsGlobal): Record<string, string> {
    const flat: Record<string, string> = {}

    const common = global?.common
    if (common && typeof common === 'object') {
        for (const [key, value] of Object.entries(common)) {
            if (typeof value === 'string' && value) flat[key] = value
        }
    }

    const entries = global?.entries
    if (Array.isArray(entries)) {
        for (const entry of entries) {
            if (entry?.key && entry?.value) flat[entry.key] = entry.value
        }
    }

    return flat
}
