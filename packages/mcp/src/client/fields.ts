import type { Payload } from 'payload'

type AnyField = Record<string, any>

export type Slot = {
    /** Dotted path from the block or document root, e.g. "introduction.content" or "cards.0.url". */
    path: string
    type: string
    localized: boolean
    required: boolean
    maxLength?: number
    value: unknown
    description?: string
}

export type SlotKind = 'text' | 'richText' | 'image' | 'fixed'

const PRESENTATIONAL = new Set(['row', 'collapsible'])
const TEXT_TYPES = new Set(['text', 'textarea'])

/** Addressing and layout, not content. Visible in a listing, never writable through this connection. */
const STRUCTURAL_NAMES = new Set(['id', 'blockName', 'sectionId', 'slug', 'path', 'localizedPaths'])

const isSuppressed = (field: AnyField): boolean =>
    field.hidden === true || field.admin?.hidden === true || field.admin?.readOnly === true

/**
 * The fields that carry data at one level. Rows, collapsibles and unnamed tabs group fields in the
 * admin UI without nesting the data, so they are unwrapped rather than treated as a path segment.
 */
function* dataFields(fields: AnyField[] | undefined): Generator<AnyField> {
    for (const field of fields ?? []) {
        if (!field || isSuppressed(field)) continue

        if (field.type === 'tabs') {
            for (const tab of field.tabs ?? []) {
                if (!tab) continue
                if (tab.name) yield { ...tab, type: 'group' }
                else yield* dataFields(tab.fields)
            }
            continue
        }

        if (PRESENTATIONAL.has(field.type)) {
            yield* dataFields(field.fields)
            continue
        }

        if (!field.name || field.type === 'ui') continue
        yield field
    }
}

export const collectionFields = (payload: Payload, collection: string): AnyField[] =>
    (payload.config.collections.find((entry) => entry.slug === collection)?.fields ?? []) as AnyField[]

/** The document's own fields, with the section blocks left out; those are addressed by sectionId. */
export const documentFields = (payload: Payload, collection: string): AnyField[] =>
    [...dataFields(collectionFields(payload, collection))].filter((field) => field.type !== 'blocks')

export const topLevelField = (payload: Payload, collection: string, name: string): AnyField | null => {
    for (const field of dataFields(collectionFields(payload, collection))) {
        if (field.name === name) return field
    }
    return null
}

export const topLevelFieldsOfType = (payload: Payload, collection: string, type: string): AnyField[] =>
    [...dataFields(collectionFields(payload, collection))].filter((field) => field.type === type)

export const findBlockFields = (payload: Payload, collection: string, blockType: string): AnyField[] | null => {
    const search = (fields: AnyField[] | undefined): AnyField[] | null => {
        for (const field of dataFields(fields)) {
            if (field.type === 'blocks') {
                const match = (field.blocks ?? []).find((block: AnyField) => block?.slug === blockType)
                if (match) return (match.fields ?? []) as AnyField[]
            }
            if (Array.isArray(field.fields)) {
                const nested = search(field.fields)
                if (nested) return nested
            }
        }
        return null
    }
    return search(collectionFields(payload, collection))
}

/**
 * Every addressable leaf under `fields`, paired with whatever the document currently holds there.
 * A field with no value still produces a slot, because an empty slot the caller cannot see is one
 * it will conclude does not exist.
 */
export const collectSlots = (fields: AnyField[] | undefined, data: unknown, prefix = ''): Slot[] => {
    const record = (data ?? {}) as Record<string, unknown>
    const slots: Slot[] = []

    for (const field of dataFields(fields)) {
        const path = prefix ? `${prefix}.${field.name}` : field.name
        const value = record[field.name]

        if (field.type === 'group') {
            slots.push(...collectSlots(field.fields, value, path))
            continue
        }

        if (field.type === 'array') {
            const rows = Array.isArray(value) ? value : []
            if (!rows.length) {
                slots.push({ path, type: 'array', localized: false, required: !!field.required, value: rows })
                continue
            }
            rows.forEach((row, index) => slots.push(...collectSlots(field.fields, row, `${path}.${index}`)))
            continue
        }

        if (field.type === 'blocks') {
            const rows = Array.isArray(value) ? value : []
            rows.forEach((row: AnyField, index) => {
                const definition = (field.blocks ?? []).find((block: AnyField) => block?.slug === row?.blockType)
                if (definition) slots.push(...collectSlots(definition.fields, row, `${path}.${index}`))
            })
            continue
        }

        slots.push({
            path,
            type: field.type,
            localized: !!field.localized,
            required: !!field.required,
            maxLength: typeof field.maxLength === 'number' ? field.maxLength : undefined,
            value,
            description: field.admin?.description,
        })
    }

    return slots
}

export type SlotLens = {
    kind: (slot: Slot) => SlotKind
    pathsOf: (slots: Slot[], kind: SlotKind) => string[]
}

/**
 * What a caller is allowed to write, and with which tool.
 *
 * Copy is localized and configuration is not, so on a multilingual site the localized flag is what
 * separates a heading from a colour picker or a layout toggle, both of which are plain text fields
 * too. Uploads are exempt because media is shared across locales. Everything else stays visible in
 * a listing but is only settable in the CMS.
 */
export const slotLens = (payload: Payload): SlotLens => {
    const separatesByLocale = Boolean((payload.config as Record<string, unknown>).localization)

    const kind = (slot: Slot): SlotKind => {
        const leaf = slot.path.split('.').pop() as string
        if (STRUCTURAL_NAMES.has(leaf)) return 'fixed'
        if (slot.type === 'upload') return 'image'
        if (separatesByLocale && !slot.localized) return 'fixed'
        if (TEXT_TYPES.has(slot.type)) return 'text'
        if (slot.type === 'richText') return 'richText'
        return 'fixed'
    }

    return {
        kind,
        pathsOf: (slots, wanted) => slots.filter((slot) => kind(slot) === wanted).map((slot) => slot.path),
    }
}

export const valueAtPath = (source: unknown, path: string): unknown =>
    path.split('.').reduce<any>((node, key) => (node === null || node === undefined ? undefined : node[key]), source)

export const setAtPath = (target: Record<string, unknown>, path: string, value: unknown): void => {
    const keys = path.split('.')
    let node: any = target
    for (let index = 0; index < keys.length - 1; index += 1) {
        const key = keys[index]
        if (node[key] === null || node[key] === undefined) {
            node[key] = /^\d+$/.test(keys[index + 1]) ? [] : {}
        }
        node = node[key]
    }
    node[keys[keys.length - 1]] = value
}

export const mediaIdOf = (value: unknown): string | null => {
    if (value === null || value === undefined || value === '') return null
    if (typeof value === 'object') {
        const id = (value as Record<string, unknown>).id
        return id === undefined || id === null ? null : String(id)
    }
    return String(value)
}
