import type { Field } from 'payload'

const TEXT_TYPES = new Set(['text', 'textarea', 'email'])

const GLOBAL_SKIP_KEYS = new Set([
  // Payload auto-injects `id` as a text field on every array/blocks item; without this guard we'd index UUIDs as content.
  'id',
  'filename',
  'mimeType',
  'sizes',
  'thumbnailURL',
  'url',
  'hash',
  'salt',
  'localizedPaths',
])

function isLexical(val: unknown): val is { root: unknown } {
  return (
    typeof val === 'object' &&
    val !== null &&
    !Array.isArray(val) &&
    'root' in (val as object)
  )
}

function lexicalToText(json: unknown): string {
  if (!isLexical(json)) return ''
  const parts: string[] = []
  const walk = (node: Record<string, unknown>) => {
    if (node.type === 'text' && typeof node.text === 'string') parts.push(node.text)
    const children = node.children as Record<string, unknown>[] | undefined
    if (children) for (const child of children) walk(child)
  }
  walk(json.root as Record<string, unknown>)
  return parts.join(' ')
}

function pushString(
  value: unknown,
  perLocale: Record<string, string[]>,
  localeCodes: string[],
  localized: boolean | undefined,
) {
  if (value === null || value === undefined) return
  if (localized && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    for (const code of localeCodes) {
      const v = obj[code]
      if (typeof v === 'string' && v.trim()) perLocale[code].push(v)
    }
    return
  }
  if (typeof value === 'string' && value.trim()) {
    for (const code of localeCodes) perLocale[code].push(value)
  }
}

function pushRichText(
  value: unknown,
  perLocale: Record<string, string[]>,
  localeCodes: string[],
  localized: boolean | undefined,
) {
  if (value === null || value === undefined) return
  if (localized && typeof value === 'object' && !Array.isArray(value) && !isLexical(value)) {
    const obj = value as Record<string, unknown>
    for (const code of localeCodes) {
      const text = lexicalToText(obj[code])
      if (text.trim()) perLocale[code].push(text)
    }
    return
  }
  const text = lexicalToText(value)
  if (text.trim()) for (const code of localeCodes) perLocale[code].push(text)
}

function visit(
  value: unknown,
  fields: Field[],
  perLocale: Record<string, string[]>,
  localeCodes: string[],
  skipKeys: Set<string>,
) {
  if (value === null || value === undefined) return
  if (typeof value !== 'object' || Array.isArray(value)) return
  const obj = value as Record<string, unknown>

  for (const field of fields) {
    if (field.type === 'row' || field.type === 'collapsible') {
      visit(obj, field.fields, perLocale, localeCodes, skipKeys)
      continue
    }

    if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        if ('name' in tab && tab.name) {
          visit(obj[tab.name], tab.fields, perLocale, localeCodes, skipKeys)
        } else {
          visit(obj, tab.fields, perLocale, localeCodes, skipKeys)
        }
      }
      continue
    }

    if (field.type === 'ui') continue
    if (!('name' in field) || !field.name) continue
    if (skipKeys.has(field.name)) continue

    const fv = obj[field.name]
    if (fv === null || fv === undefined) continue

    const localized = 'localized' in field ? field.localized : undefined

    if (field.type === 'group') {
      if (localized && typeof fv === 'object' && !Array.isArray(fv)) {
        const lo = fv as Record<string, unknown>
        for (const code of localeCodes) {
          if (lo[code] !== undefined) visit(lo[code], field.fields, perLocale, [code], skipKeys)
        }
      } else {
        visit(fv, field.fields, perLocale, localeCodes, skipKeys)
      }
    } else if (field.type === 'array') {
      const visitArray = (arr: unknown, codes: string[]) => {
        if (!Array.isArray(arr)) return
        for (const item of arr) visit(item, field.fields, perLocale, codes, skipKeys)
      }
      if (localized && typeof fv === 'object' && !Array.isArray(fv)) {
        const lo = fv as Record<string, unknown>
        for (const code of localeCodes) visitArray(lo[code], [code])
      } else {
        visitArray(fv, localeCodes)
      }
    } else if (field.type === 'blocks') {
      const visitBlocks = (arr: unknown, codes: string[]) => {
        if (!Array.isArray(arr)) return
        for (const item of arr) {
          const blockType = (item as { blockType?: string } | null)?.blockType
          const block = field.blocks.find((b) => b.slug === blockType)
          if (!block) continue
          visit(item, block.fields, perLocale, codes, skipKeys)
        }
      }
      if (localized && typeof fv === 'object' && !Array.isArray(fv)) {
        const lo = fv as Record<string, unknown>
        for (const code of localeCodes) visitBlocks(lo[code], [code])
      } else {
        visitBlocks(fv, localeCodes)
      }
    } else if (TEXT_TYPES.has(field.type)) {
      pushString(fv, perLocale, localeCodes, localized)
    } else if (field.type === 'richText') {
      pushRichText(fv, perLocale, localeCodes, localized)
    }
  }
}

export interface ExtractTextOptions {
  extraSkipKeys?: string[]
}

export function extractText(
  doc: unknown,
  localeCodes: string[],
  fields: Field[],
  options: ExtractTextOptions = {},
): { perLocale: Record<string, string>; title: Record<string, string> } {
  const perLocale: Record<string, string[]> = Object.fromEntries(
    localeCodes.map((c) => [c, []]),
  )
  const title: Record<string, string> = Object.fromEntries(localeCodes.map((c) => [c, '']))

  const skipKeys = new Set<string>([...GLOBAL_SKIP_KEYS, ...(options.extraSkipKeys ?? [])])

  visit(doc, fields, perLocale, localeCodes, skipKeys)

  const docRecord = doc as Record<string, unknown>
  const titleCandidates = ['name', 'title', 'metaTitle', 'heading']
  for (const code of localeCodes) {
    for (const key of titleCandidates) {
      const val = docRecord[key]
      if (typeof val === 'string' && val.trim()) {
        title[code] = val
        break
      }
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        const localeVal = (val as Record<string, unknown>)[code]
        if (typeof localeVal === 'string' && localeVal.trim()) {
          title[code] = localeVal
          break
        }
      }
    }
  }

  const result: Record<string, string> = {}
  for (const code of localeCodes) {
    result[code] = perLocale[code].join(' \n ').replace(/\s+/g, ' ').trim()
  }

  return { perLocale: result, title }
}

export function resolveUrl(
  collection: string,
  doc: Record<string, unknown>,
  locale: string,
  opts?: { prefixLocale?: boolean },
): string | null {
  const lp = doc.localizedPaths
  if (typeof lp === 'object' && lp !== null && !Array.isArray(lp)) {
    const path = (lp as Record<string, unknown>)[locale]
    if (typeof path === 'string' && path) {
      const normalized = path === '/' ? '/' : path.startsWith('/') ? path : `/${path}`
      if (opts?.prefixLocale === false) return normalized
      const prefix = `/${locale}`
      return normalized === '/' ? prefix : `${prefix}${normalized}`
    }
  }
  return null
}
