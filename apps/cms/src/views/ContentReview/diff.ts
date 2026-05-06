import 'server-only'
import type { Payload } from 'payload'

export interface FieldDiff {
  path: string
  old: string
  new: string
  locale?: string
}

export interface ItemDiff {
  status: 'added' | 'removed' | 'changed'
  itemId: string
  arrayKey: string
  label: string
  blockType?: string
  fieldDiffs: FieldDiff[]
}

export interface DocumentDiff {
  fieldDiffs: FieldDiff[]
  itemDiffs: ItemDiff[]
  hasChanges: boolean
  isNew: boolean
  changedFieldsSummary: string
}

const SKIP_FIELDS = new Set([
  'id',
  '_status',
  'updatedAt',
  'createdAt',
  'localizedPaths',
  'sizes',
  'filename',
  'mimeType',
  'filesize',
  'width',
  'height',
  'focalX',
  'focalY',
  'author',
  'publishedAt',
  'populatedAuthors',
  'hash',
  'salt',
])

function isLexical(val: unknown): val is { root: unknown } {
  return typeof val === 'object' && val !== null && !Array.isArray(val) && 'root' in val
}

function lexicalToText(json: unknown): string {
  if (!isLexical(json)) return ''
  const extract = (node: Record<string, unknown>): string => {
    if (node.type === 'text') return String(node.text ?? '')
    const children = node.children as Record<string, unknown>[] | undefined
    return children?.map(extract).join(' ') ?? ''
  }
  return extract(json.root as Record<string, unknown>)
    .replace(/\s+/g, ' ')
    .trim()
}

function lexicalEqual(a: unknown, b: unknown): boolean {
  const aLex = isLexical(a)
  const bLex = isLexical(b)
  if (!aLex && !bLex) return true
  if (aLex !== bLex) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

function valueToString(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (isLexical(val)) return lexicalToText(val)
  return ''
}

function resolveString(val: unknown, localeCodes: string[]): string {
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>
    for (const code of localeCodes) {
      if (code in obj && typeof obj[code] === 'string') return obj[code] as string
    }
  }
  return ''
}

function getItemLabel(item: Record<string, unknown>, localeCodes: string[]): string {
  return (
    resolveString(item.sectionHeading, localeCodes) ||
    resolveString(item.heading, localeCodes) ||
    resolveString(item.label, localeCodes) ||
    resolveString(item.name, localeCodes) ||
    resolveString(item.text, localeCodes) ||
    resolveString(item.title, localeCodes) ||
    String(item.blockType ?? 'Item')
  )
}

function buildSummary(fieldDiffs: FieldDiff[], itemDiffs: ItemDiff[]): string {
  const parts: string[] = []
  if (fieldDiffs.length > 0) parts.push(...[...new Set(fieldDiffs.map((d) => d.path.split('.')[0]))])
  if (itemDiffs.length > 0) parts.push(...[...new Set(itemDiffs.map((d) => d.arrayKey))])
  return [...new Set(parts)].join(', ')
}

function compareScalarFields(
  pub: Record<string, unknown>,
  draft: Record<string, unknown>,
  prefix: string,
): FieldDiff[] {
  const diffs: FieldDiff[] = []
  const allKeys = new Set([...Object.keys(pub), ...Object.keys(draft)])

  for (const key of allKeys) {
    if (SKIP_FIELDS.has(key)) continue
    const fieldPath = prefix ? `${prefix}.${key}` : key
    const pubVal = pub[key]
    const draftVal = draft[key]

    if (Array.isArray(pubVal) || Array.isArray(draftVal)) continue

    if (isLexical(pubVal) || isLexical(draftVal)) {
      if (!lexicalEqual(pubVal, draftVal)) {
        diffs.push({ path: fieldPath, old: lexicalToText(pubVal), new: lexicalToText(draftVal) })
      }
      continue
    }

    if (typeof draftVal === 'object' && draftVal !== null) {
      diffs.push(...compareScalarFields((pubVal as Record<string, unknown>) ?? {}, draftVal as Record<string, unknown>, fieldPath))
      continue
    }
    if (typeof pubVal === 'object' && pubVal !== null) {
      diffs.push(...compareScalarFields(pubVal as Record<string, unknown>, (draftVal as Record<string, unknown>) ?? {}, fieldPath))
      continue
    }

    const oldStr = valueToString(pubVal)
    const newStr = valueToString(draftVal)
    if (oldStr !== newStr && (oldStr || newStr)) diffs.push({ path: fieldPath, old: oldStr, new: newStr })
  }

  return diffs
}

function compareIdArrays(
  pubArr: Record<string, unknown>[],
  draftArr: Record<string, unknown>[],
  arrayKey: string,
  localeCodes: string[],
): ItemDiff[] {
  const diffs: ItemDiff[] = []
  const toObj = (i: unknown): i is Record<string, unknown> => typeof i === 'object' && i !== null
  const pubObjs = pubArr.filter(toObj)
  const draftObjs = draftArr.filter(toObj)
  const pubById = new Map(pubObjs.map((item) => [String(item.id), item]))
  const draftById = new Map(draftObjs.map((item) => [String(item.id), item]))

  for (const [id, item] of pubById) {
    if (!draftById.has(id)) {
      diffs.push({ status: 'removed', itemId: id, arrayKey, label: getItemLabel(item, localeCodes), blockType: item.blockType as string | undefined, fieldDiffs: [] })
    }
  }
  for (const [id, draftItem] of draftById) {
    const pubItem = pubById.get(id)
    if (!pubItem) {
      diffs.push({ status: 'added', itemId: id, arrayKey, label: getItemLabel(draftItem, localeCodes), blockType: draftItem.blockType as string | undefined, fieldDiffs: [] })
    } else {
      const fieldDiffs = compareScalarFields(pubItem, draftItem, '')
      if (fieldDiffs.length > 0) {
        diffs.push({ status: 'changed', itemId: id, arrayKey, label: getItemLabel(draftItem, localeCodes), blockType: draftItem.blockType as string | undefined, fieldDiffs })
      }
    }
  }

  return diffs
}

function computeLocaleDiff(
  published: Record<string, unknown>,
  draft: Record<string, unknown>,
  localeCodes: string[],
): { fieldDiffs: FieldDiff[]; itemDiffs: ItemDiff[] } {
  const fieldDiffs: FieldDiff[] = []
  const itemDiffs: ItemDiff[] = []
  const allKeys = new Set([...Object.keys(published), ...Object.keys(draft)])

  for (const key of allKeys) {
    if (SKIP_FIELDS.has(key)) continue
    const pubVal = published[key]
    const draftVal = draft[key]

    if (Array.isArray(pubVal) || Array.isArray(draftVal)) {
      const pubArr = Array.isArray(pubVal) ? (pubVal as Record<string, unknown>[]) : []
      const draftArr = Array.isArray(draftVal) ? (draftVal as Record<string, unknown>[]) : []
      const toObj = (i: unknown): i is Record<string, unknown> => typeof i === 'object' && i !== null
      const hasIds = pubArr.some((i) => toObj(i) && 'id' in i) || draftArr.some((i) => toObj(i) && 'id' in i)
      if (hasIds) itemDiffs.push(...compareIdArrays(pubArr, draftArr, key, localeCodes))
      continue
    }

    if (isLexical(pubVal) || isLexical(draftVal)) {
      if (!lexicalEqual(pubVal, draftVal)) {
        fieldDiffs.push({ path: key, old: lexicalToText(pubVal), new: lexicalToText(draftVal) })
      }
      continue
    }

    if (typeof draftVal === 'object' && draftVal !== null) {
      fieldDiffs.push(...compareScalarFields((pubVal as Record<string, unknown>) ?? {}, draftVal as Record<string, unknown>, key))
      continue
    }
    if (typeof pubVal === 'object' && pubVal !== null) {
      fieldDiffs.push(...compareScalarFields(pubVal as Record<string, unknown>, (draftVal as Record<string, unknown>) ?? {}, key))
      continue
    }

    const oldStr = valueToString(pubVal)
    const newStr = valueToString(draftVal)
    if (oldStr !== newStr && (oldStr || newStr)) fieldDiffs.push({ path: key, old: oldStr, new: newStr })
  }

  return { fieldDiffs, itemDiffs }
}

function mergeAllLocaleDiffs(
  localeDiffs: Array<{ code: string; fieldDiffs: FieldDiff[]; itemDiffs: ItemDiff[] }>,
): { fieldDiffs: FieldDiff[]; itemDiffs: ItemDiff[] } {
  if (localeDiffs.length === 0) return { fieldDiffs: [], itemDiffs: [] }

  const fieldDiffs: FieldDiff[] = []
  const allFieldPaths = new Set(localeDiffs.flatMap(({ fieldDiffs }) => fieldDiffs.map((d) => d.path)))

  for (const path of allFieldPaths) {
    const perLocale = localeDiffs
      .map(({ code, fieldDiffs }) => ({ code, field: fieldDiffs.find((d) => d.path === path) }))
      .filter(({ field }) => field !== undefined) as Array<{ code: string; field: FieldDiff }>

    const allSame = perLocale.every(
      ({ field }) => field.old === perLocale[0].field.old && field.new === perLocale[0].field.new,
    )

    if (allSame) {
      fieldDiffs.push(perLocale[0].field)
    } else {
      for (const { code, field } of perLocale) {
        fieldDiffs.push({ ...field, locale: code.toUpperCase() })
      }
    }
  }

  const itemDiffs: ItemDiff[] = []
  const allItemIds = new Set(localeDiffs.flatMap(({ itemDiffs }) => itemDiffs.map((d) => d.itemId)))

  for (const id of allItemIds) {
    const perLocale = localeDiffs
      .map(({ code, itemDiffs }) => ({ code, item: itemDiffs.find((d) => d.itemId === id) }))
      .filter(({ item }) => item !== undefined) as Array<{ code: string; item: ItemDiff }>

    if (perLocale.length === 0) continue

    const hasStructural = perLocale.some(({ item }) => item.status !== 'changed')
    if (hasStructural) {
      const allAgree = perLocale.every(({ item }) => item.status === perLocale[0].item.status)
      if (allAgree) {
        itemDiffs.push(perLocale[0].item)
      } else {
        for (const { item } of perLocale) itemDiffs.push(item)
      }
      continue
    }

    const allFieldPathsInItem = new Set(perLocale.flatMap(({ item }) => item.fieldDiffs.map((d) => d.path)))
    const mergedFieldDiffs: FieldDiff[] = []

    for (const path of allFieldPathsInItem) {
      const perLocaleFields = perLocale
        .map(({ code, item }) => ({ code, field: item.fieldDiffs.find((d) => d.path === path) }))
        .filter(({ field }) => field !== undefined) as Array<{ code: string; field: FieldDiff }>

      const allSame = perLocaleFields.every(
        ({ field }) => field.old === perLocaleFields[0].field.old && field.new === perLocaleFields[0].field.new,
      )

      if (allSame) {
        mergedFieldDiffs.push(perLocaleFields[0].field)
      } else {
        for (const { code, field } of perLocaleFields) {
          mergedFieldDiffs.push({ ...field, locale: code.toUpperCase() })
        }
      }
    }

    if (mergedFieldDiffs.length > 0) {
      itemDiffs.push({ ...perLocale[0].item, fieldDiffs: mergedFieldDiffs })
    }
  }

  return { fieldDiffs, itemDiffs }
}

function getLocaleCodes(payload: Payload): string[] {
  const localeConfig = payload.config.localization !== false ? payload.config.localization : undefined
  return localeConfig && localeConfig.locales.length > 0
    ? localeConfig.locales.map((l) => l.code)
    : ['en']
}

export async function fetchCollectionDiff(
  payload: Payload,
  collection: string,
  parentId: string,
): Promise<DocumentDiff> {
  const localeCodes = getLocaleCodes(payload)

  const fetches = localeCodes.flatMap((locale) => [
    (payload.findByID as any)({ collection, id: parentId, draft: true,  locale, depth: 0, overrideAccess: true }),
    (payload.findByID as any)({ collection, id: parentId, draft: false, locale, depth: 0, overrideAccess: true }),
  ])
  const results = await Promise.allSettled(fetches)

  const firstPub = results[1]
  const isNew =
    firstPub.status === 'rejected' ||
    (firstPub.status === 'fulfilled' && (firstPub.value as Record<string, unknown>)._status !== 'published')

  const localeDiffs = localeCodes.map((code, i) => {
    const draftResult = results[i * 2]
    const pubResult   = results[i * 2 + 1]
    const draft = draftResult.status === 'fulfilled' ? draftResult.value as Record<string, unknown> : {}
    const pub   = isNew ? {} : (pubResult.status === 'fulfilled' ? pubResult.value as Record<string, unknown> : {})
    return { code, ...computeLocaleDiff(pub, draft, localeCodes) }
  })

  const { fieldDiffs, itemDiffs } = mergeAllLocaleDiffs(localeDiffs)
  const hasChanges = fieldDiffs.length > 0 || itemDiffs.length > 0

  return {
    fieldDiffs,
    itemDiffs,
    hasChanges,
    isNew,
    changedFieldsSummary: buildSummary(fieldDiffs, itemDiffs),
  }
}

export async function fetchGlobalDiff(payload: Payload, slug: string): Promise<DocumentDiff> {
  const localeCodes = getLocaleCodes(payload)

  const fetches = localeCodes.flatMap((locale) => [
    (payload.findGlobal as any)({ slug, draft: true,  locale, depth: 0, overrideAccess: true }),
    (payload.findGlobal as any)({ slug, draft: false, locale, depth: 0, overrideAccess: true }),
  ])
  const results = await Promise.allSettled(fetches)

  const firstPub = results[1]
  const isNew =
    firstPub.status === 'rejected' ||
    (firstPub.status === 'fulfilled' && (firstPub.value as Record<string, unknown>)._status !== 'published')

  const localeDiffs = localeCodes.map((code, i) => {
    const draftResult = results[i * 2]
    const pubResult   = results[i * 2 + 1]
    const draft = draftResult.status === 'fulfilled' ? draftResult.value as Record<string, unknown> : {}
    const pub   = isNew ? {} : (pubResult.status === 'fulfilled' ? pubResult.value as Record<string, unknown> : {})
    return { code, ...computeLocaleDiff(pub, draft, localeCodes) }
  })

  const { fieldDiffs, itemDiffs } = mergeAllLocaleDiffs(localeDiffs)
  const hasChanges = fieldDiffs.length > 0 || itemDiffs.length > 0

  return {
    fieldDiffs,
    itemDiffs,
    hasChanges,
    isNew,
    changedFieldsSummary: buildSummary(fieldDiffs, itemDiffs),
  }
}
