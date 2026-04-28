import { payloadConfigBase } from '@payload-config/payload-base.config'

interface FieldInfo {
  name: string
  type: string
  localized?: boolean
  required?: boolean
  hasMany?: boolean
  relationTo?: string | string[]
  options?: Array<{ label: string; value: string } | string>
  fields?: FieldInfo[]
  blocks?: BlockInfo[]
  admin?: { description?: string }
}

interface BlockInfo {
  slug: string
  fields: FieldInfo[]
}

interface CollectionInfo {
  slug: string
  fields: FieldInfo[]
  versions?: boolean
}

interface GlobalInfo {
  slug: string
  fields: FieldInfo[]
}

function extractField(field: Record<string, unknown>): FieldInfo | null {
  // Skip UI-only fields and unnamed fields
  if (field.type === 'ui') return null
  if (!field.name && field.type !== 'tabs' && field.type !== 'row' && field.type !== 'collapsible') return null

  const info: FieldInfo = {
    name: (field.name as string) || '',
    type: field.type as string,
  }

  if (field.localized) info.localized = true
  if (field.required) info.required = true
  if (field.hasMany) info.hasMany = true
  if (field.relationTo) info.relationTo = field.relationTo as string | string[]

  if (field.options) {
    info.options = (field.options as Array<Record<string, unknown>>).map(opt =>
      typeof opt === 'string' ? opt : { label: opt.label as string, value: opt.value as string },
    )
  }

  if (field.admin && (field.admin as Record<string, unknown>).description) {
    info.admin = { description: (field.admin as Record<string, unknown>).description as string }
  }

  // Recurse into sub-fields
  if (field.fields && Array.isArray(field.fields)) {
    info.fields = extractFields(field.fields as Record<string, unknown>[])
  }

  // Handle blocks
  if (field.blocks && Array.isArray(field.blocks)) {
    info.blocks = (field.blocks as Record<string, unknown>[]).map(block => ({
      slug: block.slug as string,
      fields: extractFields((block.fields || []) as Record<string, unknown>[]),
    }))
  }

  // Handle tabs (flatten tab fields into parent)
  if (field.type === 'tabs' && field.tabs) {
    const allFields: FieldInfo[] = []
    for (const tab of field.tabs as Record<string, unknown>[]) {
      if (tab.fields && Array.isArray(tab.fields)) {
        allFields.push(...extractFields(tab.fields as Record<string, unknown>[]))
      }
    }
    return { name: '_tabs', type: 'tabs', fields: allFields }
  }

  // Handle row / collapsible (layout wrappers — flatten)
  if ((field.type === 'row' || field.type === 'collapsible') && field.fields) {
    return { name: `_${field.type as string}`, type: field.type as string, fields: extractFields(field.fields as Record<string, unknown>[]) }
  }

  return info
}

function extractFields(fields: Record<string, unknown>[]): FieldInfo[] {
  const result: FieldInfo[] = []
  for (const field of fields) {
    const info = extractField(field)
    if (!info) continue

    // Flatten layout wrappers (tabs, row, collapsible) — lift children up
    if ((info.type === 'tabs' || info.type === 'row' || info.type === 'collapsible') && info.fields) {
      result.push(...info.fields)
    } else {
      result.push(info)
    }
  }
  return result
}

function formatField(field: FieldInfo, indent: number): string {
  const pad = '  '.repeat(indent)
  const flags: string[] = []
  if (field.localized) flags.push('localized')
  if (field.required) flags.push('required')
  if (field.hasMany) flags.push('hasMany')
  if (field.relationTo) flags.push(`relationTo: ${Array.isArray(field.relationTo) ? field.relationTo.join('|') : field.relationTo}`)

  const flagStr = flags.length ? ` (${flags.join(', ')})` : ''
  let line = `${pad}- **${field.name}**: \`${field.type}\`${flagStr}`

  if (field.admin?.description) {
    line += ` — ${field.admin.description}`
  }

  if (field.options) {
    const opts = field.options.map(o => typeof o === 'string' ? o : o.value).join(', ')
    line += ` [${opts}]`
  }

  const lines = [line]

  if (field.fields && field.fields.length > 0) {
    for (const sub of field.fields) {
      lines.push(formatField(sub, indent + 1))
    }
  }

  if (field.blocks && field.blocks.length > 0) {
    for (const block of field.blocks) {
      lines.push(`${pad}  - Block: **${block.slug}**`)
      for (const bf of block.fields) {
        lines.push(formatField(bf, indent + 2))
      }
    }
  }

  return lines.join('\n')
}

export function getSchema(): string {
  const config = payloadConfigBase

  const collections: CollectionInfo[] = (config.collections as Record<string, unknown>[]).map(col => ({
    slug: col.slug as string,
    fields: extractFields((col.fields || []) as Record<string, unknown>[]),
    versions: !!(col.versions),
  }))

  const globals: GlobalInfo[] = (config.globals as Record<string, unknown>[]).map(g => ({
    slug: g.slug as string,
    fields: extractFields((g.fields || []) as Record<string, unknown>[]),
  }))

  const lines: string[] = ['# Payload CMS Schema\n']

  // Locales
  const locales = config.localization as { locales: Array<{ code: string; label: string }>; defaultLocale: string }
  lines.push(`## Locales: ${locales.locales.map(l => `${l.code} (${l.label})`).join(', ')} — default: ${locales.defaultLocale}\n`)

  // Collections
  lines.push('## Collections\n')
  for (const col of collections) {
    lines.push(`### ${col.slug}${col.versions ? ' (versioned)' : ''}\n`)
    for (const field of col.fields) {
      lines.push(formatField(field, 0))
    }
    lines.push('')
  }

  // Globals
  lines.push('## Globals\n')
  for (const g of globals) {
    lines.push(`### ${g.slug}\n`)
    for (const field of g.fields) {
      lines.push(formatField(field, 0))
    }
    lines.push('')
  }

  return lines.join('\n')
}
