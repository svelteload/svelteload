import { MCP_SCOPES } from '@svelteload/payload/utils/mcpScopes'
import type { McpTool, ToolContext } from '../types'
import {
    lexicalContainsUneditableNodes,
    lexicalToMarkdown,
    markdownToLexical,
} from '@svelteload/payload/utils/lexicalText'
import { generateSlugFromName } from '@svelteload/payload/utils/generateSlugFromName'
import {
    collectSlots,
    documentFields,
    findBlockFields,
    mediaIdOf,
    setAtPath,
    slotLens,
    topLevelField,
    topLevelFieldsOfType,
    valueAtPath,
    type Slot,
    type SlotKind,
    type SlotLens,
} from './fields'

type CollectionShape = {
    /** Field that carries the human-readable name. */
    titleField: 'name' | 'title'
    /** Required publish date field, if the collection has one. */
    dateField?: string
    /** Collections built from `metadataFields` require metaTitle and metaDescription. */
    requiresMeta: boolean
    /** Lexical body field that is required at creation. */
    bodyField?: string
    /** Collections whose path comes from a landing page need a slug; Pages carry a full path. */
    urlField: 'path' | 'slug'
}

const COLLECTION_SHAPES: Record<string, CollectionShape> = {
    pages: { titleField: 'name', requiresMeta: true, urlField: 'path' },
    projects: { titleField: 'name', dateField: 'publishDate', requiresMeta: true, urlField: 'slug' },
    tools: { titleField: 'name', dateField: 'publishDate', requiresMeta: true, urlField: 'slug' },
    blog: { titleField: 'title', dateField: 'publicationDate', requiresMeta: false, bodyField: 'content', urlField: 'slug' },
}

const EDITABLE_COLLECTIONS = ['pages', 'blog', 'projects', 'tools'] as const

const collectionEnum = {
    type: 'string',
    enum: EDITABLE_COLLECTIONS,
    description: 'Which kind of document. Defaults to "pages".',
}

const MAX_META_DESCRIPTION = 200

const resolveCollection = (value: unknown): string => {
    const slug = typeof value === 'string' && value ? value : 'pages'
    if (!(EDITABLE_COLLECTIONS as readonly string[]).includes(slug)) {
        throw new Error(`"${slug}" is not editable through this connection. Use one of: ${EDITABLE_COLLECTIONS.join(', ')}.`)
    }
    return slug
}

const callArgs = (ctx: ToolContext) => ({
    user: ctx.user as never,
    overrideAccess: false,
    context: { mcpScopes: ctx.scopes },
})

const isLexical = (value: unknown): boolean =>
    Boolean(value && typeof value === 'object' && 'root' in (value as Record<string, unknown>))

const KIND_LABEL: Record<SlotKind, string> = {
    text: 'text',
    richText: 'rich text',
    image: 'image',
    fixed: 'fixed',
}

const TOOL_FOR_KIND: Record<SlotKind, string> = {
    text: 'edit_text',
    richText: 'edit_rich_text',
    image: 'set_section_image',
    fixed: '',
}

const renderValue = (slot: Slot, indent: string): string => {
    if (slot.type === 'richText') {
        if (!isLexical(slot.value)) return '(empty)'
        const markdown = lexicalToMarkdown(slot.value)
        return markdown ? `\n${markdown.replace(/^/gm, `${indent}  `)}` : '(empty)'
    }
    if (slot.type === 'upload') {
        const id = mediaIdOf(slot.value)
        return id ? `media ${id}` : '(empty)'
    }
    if (typeof slot.value === 'string') {
        if (!slot.value) return '(empty)'
        return slot.value.length > 300 ? `${slot.value.slice(0, 300)}…` : slot.value
    }
    if (slot.value === null || slot.value === undefined) return '(empty)'
    return JSON.stringify(slot.value)
}

const describeSlot = (slot: Slot, indent: string, lens: SlotLens): string[] => {
    const kind = lens.kind(slot)
    const rendered = renderValue(slot, indent)
    const label = `${indent}${slot.path} (${KIND_LABEL[kind]}, ${TOOL_FOR_KIND[kind]}):`
    const lines = [rendered.startsWith('\n') ? `${label}${rendered}` : `${label} ${rendered}`]
    if (kind === 'richText' && lexicalContainsUneditableNodes(slot.value)) {
        lines.push(`${indent}  NOTE: this embeds images or blocks, so edit_rich_text will refuse to replace it.`)
    }
    return lines
}

const describeSection = (
    section: Record<string, any>,
    index: number,
    blockFields: Record<string, any>[] | null,
    lens: SlotLens,
): string => {
    const header = `  [${index}] blockType: ${section.blockType} · sectionId: ${section.id}`
    if (!blockFields) {
        return `${header}\n      This block is not in the schema, so its fields cannot be listed. It has to be edited in the CMS.`
    }

    const slots = collectSlots(blockFields, section)
    const lines = [header]
    const fixed: string[] = []

    for (const slot of slots) {
        if (lens.kind(slot) === 'fixed') {
            fixed.push(`${slot.path} (${slot.type})`)
            continue
        }
        lines.push(...describeSlot(slot, '      ', lens))
    }

    if (fixed.length) lines.push(`      set in the CMS, not here: ${fixed.join(', ')}`)
    if (lines.length === 1) lines.push('      This block carries no editable text or images.')
    return lines.join('\n')
}

const unknownFieldMessage = (field: string, label: string, slots: Slot[], lens: SlotLens): string => {
    const text = lens.pathsOf(slots, 'text')
    const rich = lens.pathsOf(slots, 'richText')
    const image = lens.pathsOf(slots, 'image')
    return [
        `"${field}" is not a field you can write on ${label}, so nothing was written and no draft was created.`,
        text.length ? `Text fields, which edit_text can set: ${text.join(', ')}.` : 'It has no plain text fields.',
        rich.length ? `Rich text fields, which need edit_rich_text: ${rich.join(', ')}.` : '',
        image.length ? `Image fields, which need set_section_image: ${image.join(', ')}.` : '',
    ]
        .filter(Boolean)
        .join('\n')
}

const wrongToolMessage = (slot: Slot, sectionId: string | undefined, lens: SlotLens): string => {
    const kind = lens.kind(slot)
    if (kind === 'richText') {
        const target = sectionId ? ` with sectionId "${sectionId}" and field "${slot.path}"` : ` with field "${slot.path}"`
        return `"${slot.path}" is rich text, so nothing was written. Use edit_rich_text${target}.`
    }
    if (kind === 'image') {
        const tool = sectionId ? 'set_section_image' : 'set_image'
        return `"${slot.path}" is an image, so nothing was written. Use ${tool} with a media id.`
    }
    const role = sectionId
        ? 'It sets how the section looks rather than what it says'
        : 'It is part of how the document is filed rather than something a reader sees'
    return `"${slot.path}" is a ${slot.type} field and nothing was written. ${role}, so it has to be changed in the CMS.`
}

const lengthProblem = (slot: Slot, value: string): string | null => {
    const limit = slot.maxLength ?? (slot.path.endsWith('metaDescription') ? MAX_META_DESCRIPTION : undefined)
    if (limit === undefined || value.length <= limit) return null
    return `"${slot.path}" is capped at ${limit} characters by the schema. It is currently ${value.length}. Shorten it and try again.`
}

const sectionById = (doc: any, sectionId: unknown): any =>
    (Array.isArray(doc?.sections) ? doc.sections : []).find((section: any) => String(section.id) === String(sectionId))

const richTextMatches = (saved: unknown, expected: string): boolean =>
    lexicalToMarkdown(saved).trim() === lexicalToMarkdown(markdownToLexical(expected)).trim()

/**
 * Payload drops keys that are not in the schema, so a write can come back clean while persisting
 * nothing. Every writer reads its own change back rather than echoing the argument it was handed.
 */
const notPersisted = (where: string, locale: unknown, saved: unknown): string =>
    [
        `The write did not persist. ${where} (${locale}) still reads:`,
        saved === null || saved === undefined || saved === '' ? '(empty)' : String(saved),
        'Nothing else was changed. This one has to be done in the CMS.',
    ].join('\n')

const loadDoc = async (collection: string, id: unknown, locale: string | undefined, ctx: ToolContext) => {
    const payload = ctx.payload
    return payload.findByID({
        collection: collection as never,
        id: id as string | number,
        locale: (locale ?? 'all') as never,
        depth: 0,
        draft: true,
        ...callArgs(ctx),
    }) as Promise<any>
}

const previewUrlFor = async (
    collection: string,
    id: unknown,
    locale: string,
    ctx: ToolContext,
): Promise<string | null> => {
    const doc = await loadDoc(collection, id, undefined, ctx)
    const path = (doc.localizedPaths ?? {})[locale]
    if (typeof path !== 'string' || !path) return null
    return `${ctx.siteUrl}/${locale}${path === '/' ? '' : path}`
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const localeCodes = (ctx: ToolContext): string[] => {
    const localization = (ctx.payload as { config?: { localization?: unknown } }).config?.localization
    const locales = (localization as { locales?: Array<string | { code?: string }> } | undefined)?.locales
    if (!Array.isArray(locales)) return []
    return locales.map((entry) => (typeof entry === 'string' ? entry : entry?.code)).filter(Boolean) as string[]
}

const identifyingFields = (doc: any): Record<string, unknown> => {
    const data: Record<string, unknown> = {}
    if (typeof doc?.slug === 'string' && doc.slug) data.slug = doc.slug
    if (typeof doc?.path === 'string' && doc.path) data.path = doc.path
    return data
}

export const CLIENT_INSTRUCTIONS = `This server edits one website's content.

How to work:
- Start with list_content to find a document id, then get_document to see its fields, its sections and their sectionIds.
- get_document lists every field the schema defines, including the empty ones, with the tool that changes each and the exact path to pass as "field". Trust it as the full picture. A field that is not in that listing does not exist, and the writers will refuse it rather than pretend.
- create_document makes a new page, post, project or tool as a draft. You do not need the CMS admin for this.
- edit_text changes one plain text field. edit_field changes a plain text field that sits on the document itself rather than inside a section. edit_rich_text replaces a body of prose, in a section when you pass a sectionId and on the document itself when you do not, so read the current one first because it overwrites the whole field.
- Sections cannot be added or removed here, only filled in. If a page has no slot for what is being asked, say so and let them add the section in the CMS rather than writing the text somewhere it does not belong.
- rename_url changes an address. Never try to set slug or path through edit_field.
- Images cannot be sent through this connection, so pasting one into the chat does not reach the site. Call request_upload_link, give them the link it returns, then call collect_new_images with the timestamp from the same reply. That waits for the file and hands you the ids by itself. Describe each image with set_image_alt in every locale, then place it with set_section_image for a page section, or set_image for a blog post's main or social image.
- When a tool hands you a link, relay it as a clickable markdown link in your reply. Never wrap a link in backticks or a code block; it stops being clickable.

Rules that matter:
- Do the work rather than handing it back. Never ask them to read out an id, a filename, a description or a confirmation that something finished. They drop a file or answer a question about the content; everything after that is yours.
- Every change saves as a draft. You cannot publish and you cannot delete. When you are done, give the person a preview link from get_preview_link and tell them to read it and publish from that page.
- Deletion needs request_deletion, which returns a link to the document's own page with a confirmation prompt over it. The person reads the page and confirms it themselves.
- This site is multilingual. Editing one locale leaves the other stale, and publishing ships both at once, so whenever you change text in one locale offer to make the matching change in the other before they publish.
- Write in the language of the locale you are editing, and match the surrounding copy's tone rather than defaulting to marketing phrasing.`

export const TOOLS: McpTool[] = [
    {
        name: 'list_content',
        description:
            'List documents of one kind with their ids, publish status and URL path per locale. Start here to find the id of the thing you want to change.',
        scope: MCP_SCOPES.contentRead,
        inputSchema: {
            type: 'object',
            properties: { collection: collectionEnum, limit: { type: 'number' } },
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const collection = resolveCollection(args.collection)
            const payload = ctx.payload
            const result = await payload.find({
                collection: collection as never,
                limit: Math.min(Number(args.limit) || 100, 200),
                depth: 0,
                draft: true,
                locale: 'all' as never,
                ...callArgs(ctx),
            })
            if (!result.docs.length) return `No documents in "${collection}".`
            return result.docs
                .map((doc: any) => {
                    const paths = Object.entries(doc.localizedPaths ?? {})
                        .map(([locale, path]) => `${locale}:${path}`)
                        .join('  ')
                    const label = doc.name ?? doc.title
                    return `id: ${doc.id}  status: ${doc._status ?? 'unknown'}  ${paths}\n    ${JSON.stringify(label)}`
                })
                .join('\n')
        },
    },
    {
        name: 'get_document',
        description:
            'Read one document in one locale. Every field is listed against the schema, including the ones that are currently empty, with the tool that changes each. A field that is not in this listing does not exist on the document, so do not try to write it.',
        scope: MCP_SCOPES.contentRead,
        inputSchema: {
            type: 'object',
            properties: {
                collection: collectionEnum,
                id: { type: ['string', 'number'] },
                locale: { type: 'string' },
            },
            required: ['id', 'locale'],
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const collection = resolveCollection(args.collection)
            const payload = ctx.payload
            const doc = await loadDoc(collection, args.id, args.locale, ctx)

            const lens = slotLens(payload)
            const lines = [
                `${collection} ${doc.id} · ${doc.name ?? doc.title} · path ${doc.path ?? '(derived)'} · status ${doc._status ?? 'unknown'} · locale ${args.locale}`,
            ]

            for (const type of ['text', 'textarea', 'richText']) {
                for (const field of topLevelFieldsOfType(payload, collection, type)) {
                    const [slot] = collectSlots([field], doc)
                    if (!slot || lens.kind(slot) === 'fixed') continue
                    lines.push(...describeSlot(slot, '  ', lens))
                }
            }

            const sections = Array.isArray(doc.sections) ? doc.sections : []
            if (sections.length) {
                lines.push('sections:')
                lines.push(
                    ...sections.map((section: any, index: number) =>
                        describeSection(section, index, findBlockFields(payload, collection, section.blockType), lens),
                    ),
                )
            }

            return lines.join('\n')
        },
    },
    {
        name: 'create_document',
        description:
            'Create a new page, blog post, project or tool as a draft. Give the title and, for a blog post, the body. Everything else is derived. The result is never published, so hand back a preview link afterwards.',
        scope: MCP_SCOPES.contentWrite,
        inputSchema: {
            type: 'object',
            properties: {
                collection: collectionEnum,
                locale: { type: 'string' },
                title: { type: 'string', description: 'The human-readable name or title' },
                body: { type: 'string', description: 'Blog post body, as prose. Same formatting as edit_rich_text.' },
                metaDescription: { type: 'string', description: `One-sentence summary for search results, max ${MAX_META_DESCRIPTION} characters` },
                metaTitle: { type: 'string', description: 'Defaults to the title. Never append the site name.' },
                path: { type: 'string', description: 'Pages only. Full path starting with /. Derived from the title when omitted.' },
                slug: { type: 'string', description: 'Non-page collections. Derived from the title when omitted.' },
                date: { type: 'string', description: 'ISO date for the publish date. Defaults to now.' },
                metaImageId: { type: ['string', 'number'], description: 'Media id for the social preview image' },
            },
            required: ['title', 'locale'],
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const collection = resolveCollection(args.collection)
            const shape = COLLECTION_SHAPES[collection]
            const title = String(args.title ?? '').trim()

            if (!title) return 'Give a title for the new document.'

            const metaDescription = String(args.metaDescription ?? '').trim()
            if (metaDescription.length > MAX_META_DESCRIPTION) {
                return `metaDescription is capped at ${MAX_META_DESCRIPTION} characters. It is currently ${metaDescription.length}.`
            }
            if (shape.requiresMeta && !metaDescription) {
                return `A ${collection} document needs a metaDescription. Write a one-sentence summary of the page, up to ${MAX_META_DESCRIPTION} characters.`
            }
            if (shape.bodyField && !String(args.body ?? '').trim()) {
                return `A ${collection} document needs a body. Pass it as "body", written as prose.`
            }

            const data: Record<string, unknown> = { _status: 'draft', [shape.titleField]: title }

            if (shape.requiresMeta) {
                data.metaTitle = String(args.metaTitle ?? '').trim() || title
                data.metaDescription = metaDescription
            } else if (metaDescription) {
                data.metaDescription = metaDescription
            }

            if (shape.bodyField) data[shape.bodyField] = markdownToLexical(String(args.body))
            if (shape.dateField) data[shape.dateField] = String(args.date ?? '').trim() || new Date().toISOString()
            if (args.metaImageId) data.metaImage = args.metaImageId

            if (shape.urlField === 'path') {
                const path = String(args.path ?? '').trim()
                if (path && !path.startsWith('/')) return 'A page path has to start with /.'
                if (path) data.path = path
            } else {
                const slug = String(args.slug ?? '').trim() || generateSlugFromName(title)
                if (slug.includes('/')) return 'Give just the slug, without slashes.'
                data.slug = slug
            }

            const payload = ctx.payload
            const created: any = await payload.create({
                collection: collection as never,
                locale: args.locale,
                draft: true,
                data: data as never,
                ...callArgs(ctx),
            })

            const paths = Object.entries(created.localizedPaths ?? {})
                .map(([locale, path]) => `  ${locale}: ${path}`)
                .join('\n')

            return [
                `Created ${collection} ${created.id} as a draft in ${args.locale}.`,
                '',
                paths ? `Addresses:\n${paths}` : '',
                '',
                `Only the ${args.locale} locale has content. Offer to write the other locale before they publish, because publishing ships every locale at once.`,
            ]
                .filter(Boolean)
                .join('\n')
        },
    },
    {
        name: 'edit_text',
        description:
            'Change one text field inside one section, in one locale, and save as a draft. Take the field name from get_document, which lists the exact path to use, including nested ones such as "introduction.content" or "cards.0.url". Block ids are preserved so the other locale keeps its content. Never publishes.',
        scope: MCP_SCOPES.contentWrite,
        inputSchema: {
            type: 'object',
            properties: {
                collection: collectionEnum,
                id: { type: ['string', 'number'] },
                sectionId: { type: 'string' },
                field: { type: 'string', description: 'Field path as get_document lists it' },
                locale: { type: 'string' },
                value: { type: 'string' },
            },
            required: ['id', 'sectionId', 'field', 'locale', 'value'],
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const collection = resolveCollection(args.collection)
            const payload = ctx.payload
            const doc = await loadDoc(collection, args.id, args.locale, ctx)

            const sections = Array.isArray(doc.sections) ? doc.sections : []
            const target = sectionById(doc, args.sectionId)
            if (!target) return `No section with id ${args.sectionId} on ${collection} ${args.id}.`

            const blockFields = findBlockFields(payload, collection, target.blockType)
            if (!blockFields) {
                return `The ${target.blockType} block is not in the schema, so this section has to be edited in the CMS.`
            }

            const lens = slotLens(payload)
            const slots = collectSlots(blockFields, target)
            const slot = slots.find((entry) => entry.path === args.field)
            if (!slot) return unknownFieldMessage(args.field, `the ${target.blockType} block`, slots, lens)
            if (lens.kind(slot) !== 'text') return wrongToolMessage(slot, String(args.sectionId), lens)

            const tooLong = lengthProblem(slot, String(args.value))
            if (tooLong) return tooLong

            if (slot.value === args.value) {
                return `Section ${args.sectionId} field "${args.field}" already reads that in ${args.locale}. Nothing was written, so no new draft was created.`
            }

            setAtPath(target, args.field, args.value)

            await payload.update({
                collection: collection as never,
                id: args.id,
                locale: args.locale,
                draft: true,
                data: { ...identifyingFields(doc), sections, _status: 'draft' } as never,
                ...callArgs(ctx),
            })

            const fresh = await loadDoc(collection, args.id, args.locale, ctx)
            const saved = valueAtPath(sectionById(fresh, args.sectionId), args.field)
            const where = `${collection} ${args.id}, section ${args.sectionId}, field "${args.field}"`
            if (saved !== args.value) return notPersisted(where, args.locale, saved)

            return `Saved as a draft and read back to confirm. ${where} (${args.locale}) is now:\n${saved}`
        },
    },
    {
        name: 'edit_field',
        description:
            'Change one plain text field that sits on the document itself rather than inside a section, such as its title or its metaDescription. Saves as a draft. The fields differ per collection, so take the name from get_document. Use edit_text for section content, edit_rich_text for a body, and rename_url to change an address.',
        scope: MCP_SCOPES.contentWrite,
        inputSchema: {
            type: 'object',
            properties: {
                collection: collectionEnum,
                id: { type: ['string', 'number'] },
                field: { type: 'string', description: 'Field name as get_document lists it' },
                locale: { type: 'string' },
                value: { type: 'string' },
            },
            required: ['id', 'field', 'locale', 'value'],
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const collection = resolveCollection(args.collection)
            const payload = ctx.payload

            if (args.field === 'sections') return 'Use edit_text to change a section.'
            if (args.field === 'slug' || args.field === 'path') {
                return 'Use rename_url to change an address, so the old one gets redirected.'
            }

            const definition = topLevelField(payload, collection, args.field)
            if (!definition) {
                const editable = topLevelFieldsOfType(payload, collection, 'text')
                    .concat(topLevelFieldsOfType(payload, collection, 'textarea'))
                    .map((field) => field.name)
                    .filter((name) => name !== 'slug' && name !== 'path')
                return [
                    `"${args.field}" is not a field on a ${collection} document, so nothing was written and no draft was created.`,
                    editable.length
                        ? `The ones edit_field can set here are: ${editable.join(', ')}.`
                        : 'This collection has no plain text fields of its own.',
                    'Anything else lives inside a section. Read the document with get_document and use edit_text with the section it belongs to.',
                ].join('\n')
            }

            const doc = await loadDoc(collection, args.id, args.locale, ctx)
            const lens = slotLens(payload)
            const [slot] = collectSlots([definition], doc)
            if (!slot) return `"${args.field}" cannot be set through this connection.`
            if (lens.kind(slot) !== 'text') return wrongToolMessage(slot, undefined, lens)

            const tooLong = lengthProblem(slot, String(args.value))
            if (tooLong) return tooLong

            if (slot.value === args.value) {
                return `${collection} ${args.id} field "${args.field}" already reads that in ${args.locale}. Nothing was written, so no new draft was created.`
            }

            await payload.update({
                collection: collection as never,
                id: args.id,
                locale: args.locale,
                draft: true,
                data: { ...identifyingFields(doc), [args.field]: args.value, _status: 'draft' } as never,
                ...callArgs(ctx),
            })

            const fresh = await loadDoc(collection, args.id, args.locale, ctx)
            const saved = fresh[args.field]
            const where = `${collection} ${args.id} field "${args.field}"`
            if (saved !== args.value) return notPersisted(where, args.locale, saved)

            return `Saved as a draft and read back to confirm. ${where} (${args.locale}) is now:\n${saved}`
        },
    },
    {
        name: 'rename_url',
        description:
            'Change the address of a document in one locale. Saves as a draft. When it is published the old address is redirected to the new one automatically, so existing links and search results keep working. For pages give a full path starting with /; for posts, projects and tools give just the slug.',
        scope: MCP_SCOPES.contentWrite,
        inputSchema: {
            type: 'object',
            properties: {
                collection: collectionEnum,
                id: { type: ['string', 'number'] },
                locale: { type: 'string' },
                value: { type: 'string', description: 'Full path for pages (e.g. /services/imports), or a bare slug for other collections (e.g. our-new-post)' },
            },
            required: ['id', 'locale', 'value'],
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const collection = resolveCollection(args.collection)
            const field = collection === 'pages' ? 'path' : 'slug'
            const value = String(args.value).trim()

            if (!value) return 'Give the new address.'

            if (field === 'path') {
                if (!value.startsWith('/')) return 'A page path has to start with /.'
            } else {
                if (value.includes('/')) return 'Give just the slug, without slashes. The section prefix comes from the landing page.'
                if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
                    return 'A slug should be lower case letters, numbers and hyphens only.'
                }
            }

            const payload = ctx.payload
            const doc = await loadDoc(collection, args.id, args.locale, ctx)
            const previous = doc[field]

            if (previous === value) return `That is already the address. Nothing changed.`

            await payload.update({
                collection: collection as never,
                id: args.id,
                locale: args.locale,
                draft: true,
                data: { ...identifyingFields(doc), [field]: value, _status: 'draft' } as never,
                ...callArgs(ctx),
            })

            const updated = await loadDoc(collection, args.id, undefined, ctx)
            const paths = Object.entries(updated.localizedPaths ?? {})
                .map(([locale, path]) => `  ${locale}: ${path}`)
                .join('\n')

            return [
                `Saved as a draft. ${collection} ${args.id} ${field} for ${args.locale} is now "${value}".`,
                '',
                'Addresses after this change:',
                paths || '  (none yet)',
                '',
                `The old address stays live until this is published. On publish it redirects to the new one, so nothing already indexed starts returning 404.`,
            ].join('\n')
        },
    },
    {
        name: 'edit_rich_text',
        description:
            'Replace a body of prose and save as a draft. Pass a sectionId for a rich text field inside a page section, or leave it out for a document body such as a blog post. Write plain prose with a blank line between paragraphs. Use ## for a subheading, - for bullets, > for a quote and **bold** for emphasis. Read the current text with get_document first, because this replaces the whole field rather than editing part of it.',
        scope: MCP_SCOPES.contentWrite,
        inputSchema: {
            type: 'object',
            properties: {
                collection: collectionEnum,
                id: { type: ['string', 'number'] },
                locale: { type: 'string' },
                value: { type: 'string' },
                sectionId: { type: 'string', description: 'Set this when the field lives inside a page section' },
                field: { type: 'string', description: 'Field path as get_document lists it. Defaults to "content".' },
            },
            required: ['id', 'locale', 'value'],
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const collection = resolveCollection(args.collection)
            const field = typeof args.field === 'string' && args.field ? args.field : 'content'
            const payload = ctx.payload
            const doc = await loadDoc(collection, args.id, args.locale, ctx)
            const inSection = typeof args.sectionId === 'string' && args.sectionId

            const sections = Array.isArray(doc.sections) ? doc.sections : []
            let owner = documentFields(payload, collection)
            let target: any = null

            if (inSection) {
                target = sectionById(doc, args.sectionId)
                if (!target) return `No section with id ${args.sectionId} on ${collection} ${args.id}.`
                const blockFields = findBlockFields(payload, collection, target.blockType)
                if (!blockFields) {
                    return `The ${target.blockType} block is not in the schema, so this section has to be edited in the CMS.`
                }
                owner = blockFields
            }

            const lens = slotLens(payload)
            const slots = collectSlots(owner, inSection ? target : doc)
            const slot = slots.find((entry) => entry.path === field)
            if (!slot) {
                const label = inSection ? `the ${target.blockType} block` : `a ${collection} document`
                return unknownFieldMessage(field, label, slots, lens)
            }
            if (lens.kind(slot) !== 'richText') {
                return wrongToolMessage(slot, inSection ? String(args.sectionId) : undefined, lens)
            }

            if (lexicalContainsUneditableNodes(slot.value)) {
                return `The current "${field}" embeds images or blocks. Replacing it would delete them, so this has to be edited in the CMS instead.`
            }
            if (isLexical(slot.value) && richTextMatches(slot.value, args.value)) {
                return `"${field}" already reads that in ${args.locale}. Nothing was written, so no new draft was created.`
            }

            const data: Record<string, unknown> = { ...identifyingFields(doc), _status: 'draft' }
            if (inSection) {
                setAtPath(target, field, markdownToLexical(args.value))
                data.sections = sections
            } else {
                data[field] = markdownToLexical(args.value)
            }

            await payload.update({
                collection: collection as never,
                id: args.id,
                locale: args.locale,
                draft: true,
                data: data as never,
                ...callArgs(ctx),
            })

            const fresh = await loadDoc(collection, args.id, args.locale, ctx)
            const saved = inSection ? valueAtPath(sectionById(fresh, args.sectionId), field) : valueAtPath(fresh, field)
            const where = inSection
                ? `${collection} ${args.id}, section ${args.sectionId}, field "${field}"`
                : `${collection} ${args.id} "${field}"`
            if (!isLexical(saved) || !richTextMatches(saved, args.value)) {
                return notPersisted(where, args.locale, isLexical(saved) ? lexicalToMarkdown(saved) : saved)
            }

            return `Saved as a draft and read back to confirm. ${where} (${args.locale}) now reads:\n\n${lexicalToMarkdown(saved)}`
        },
    },
    {
        name: 'set_section_image',
        description:
            'Point a section image field at an existing media item and save as a draft. Take the field name from get_document, which lists every image slot on the section including the empty ones.',
        scope: MCP_SCOPES.contentWrite,
        inputSchema: {
            type: 'object',
            properties: {
                collection: collectionEnum,
                id: { type: ['string', 'number'] },
                sectionId: { type: 'string' },
                field: { type: 'string', description: 'Field path as get_document lists it' },
                mediaId: { type: ['string', 'number'] },
                locale: { type: 'string' },
            },
            required: ['id', 'sectionId', 'field', 'mediaId', 'locale'],
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const collection = resolveCollection(args.collection)
            const payload = ctx.payload
            const doc = await loadDoc(collection, args.id, args.locale, ctx)

            const sections = Array.isArray(doc.sections) ? doc.sections : []
            const target = sectionById(doc, args.sectionId)
            if (!target) return `No section with id ${args.sectionId} on ${collection} ${args.id}.`

            const blockFields = findBlockFields(payload, collection, target.blockType)
            if (!blockFields) {
                return `The ${target.blockType} block is not in the schema, so this section has to be edited in the CMS.`
            }

            const lens = slotLens(payload)
            const slots = collectSlots(blockFields, target)
            const slot = slots.find((entry) => entry.path === args.field)
            if (!slot) return unknownFieldMessage(args.field, `the ${target.blockType} block`, slots, lens)
            if (lens.kind(slot) !== 'image') return wrongToolMessage(slot, String(args.sectionId), lens)

            if (mediaIdOf(slot.value) === String(args.mediaId)) {
                return `Section ${args.sectionId} field "${args.field}" already points at media ${args.mediaId}. Nothing was written.`
            }

            setAtPath(target, args.field, args.mediaId)

            await payload.update({
                collection: collection as never,
                id: args.id,
                locale: args.locale,
                draft: true,
                data: { ...identifyingFields(doc), sections, _status: 'draft' } as never,
                ...callArgs(ctx),
            })

            const fresh = await loadDoc(collection, args.id, args.locale, ctx)
            const saved = mediaIdOf(valueAtPath(sectionById(fresh, args.sectionId), args.field))
            const where = `${collection} ${args.id}, section ${args.sectionId}, field "${args.field}"`
            if (saved !== String(args.mediaId)) return notPersisted(where, args.locale, saved && `media ${saved}`)

            return `Saved as a draft and read back to confirm. Section ${args.sectionId} field "${args.field}" now points at media ${saved}.`
        },
    },
    {
        name: 'set_image',
        description:
            'Attach an existing media item to a document outside of its sections. Slot "main" sets a blog post\'s own image, the one shown on the post and in listings. Slot "meta" sets the social preview image. For an image inside a page section use set_section_image instead.',
        scope: MCP_SCOPES.contentWrite,
        inputSchema: {
            type: 'object',
            properties: {
                collection: collectionEnum,
                id: { type: ['string', 'number'] },
                mediaId: { type: ['string', 'number'] },
                slot: { type: 'string', enum: ['main', 'meta'] },
            },
            required: ['id', 'mediaId', 'slot'],
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const collection = resolveCollection(args.collection)
            const payload = ctx.payload
            const doc = await loadDoc(collection, args.id, undefined, ctx)

            const data: Record<string, unknown> = { ...identifyingFields(doc), _status: 'draft' }

            if (args.slot === 'meta') {
                data.metaImage = args.mediaId
            } else {
                if (collection !== 'blog') {
                    return `Only blog posts have a main image. For ${collection} use set_section_image to place an image inside a section.`
                }
                const images = Array.isArray(doc.images) ? [...doc.images] : []
                if (images.length) images[0] = { ...images[0], image: args.mediaId }
                else images.push({ image: args.mediaId })
                data.images = images
            }

            await payload.update({
                collection: collection as never,
                id: args.id,
                draft: true,
                data: data as never,
                ...callArgs(ctx),
            })

            const slotLabel = args.slot === 'meta' ? 'social preview image' : 'main image'
            return `Saved as a draft. The ${slotLabel} on ${collection} ${args.id} is now media ${args.mediaId}.`
        },
    },
    {
        name: 'list_media',
        description: 'List images already in the media library, newest first. Use an id with set_section_image.',
        scope: MCP_SCOPES.contentRead,
        inputSchema: {
            type: 'object',
            properties: { limit: { type: 'number' } },
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const payload = ctx.payload
            const result = await payload.find({
                collection: 'media' as never,
                limit: Math.min(Number(args.limit) || 40, 100),
                depth: 0,
                sort: '-createdAt',
                ...callArgs(ctx),
            })
            if (!result.docs.length) return 'No media found.'
            return result.docs
                .map((doc: any) => `id: ${doc.id}  ${doc.filename}  ${doc.width ?? '?'}x${doc.height ?? '?'}  alt: ${JSON.stringify(doc.alt ?? '')}`)
                .join('\n')
        },
    },
    {
        name: 'request_upload_link',
        description:
            'Get the link the person uses to add images. Call this whenever a picture is needed, because images cannot be passed through this connection. It returns the address and a timestamp; hand over the link and then call collect_new_images with that timestamp, which waits for the upload and reports the ids. Never ask them to read an id back to you.',
        scope: MCP_SCOPES.contentWrite,
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        run: async (_args, ctx) => {
            const since = new Date().toISOString()

            return [
                'Show this to them as a clickable markdown link, exactly as written on the next line. Do not put it in a code block or backticks.',
                '',
                `[Upload images](${ctx.cmsUrl}/upload)`,
                '',
                `Now call collect_new_images with since="${since}". It waits for the files to arrive and hands you the ids, so do not ask them to confirm, to describe the picture, or to send anything back. They drop the file and that is the whole of their part.`,
                'They need to be signed in, and the page sends them to the sign-in screen and back if they are not.',
                'The page takes several files at once, lists each one as it lands and tells them when they are finished, so keep your own message down to the link and what the image is for.',
            ].join('\n')
        },
    },
    {
        name: 'collect_new_images',
        description:
            'Wait for images uploaded after a given moment and return their ids. Call it right after handing over the upload link, with the timestamp that request_upload_link gave you. It holds the connection open for a while, so if it reports nothing yet, simply call it again with the same timestamp.',
        scope: MCP_SCOPES.contentRead,
        inputSchema: {
            type: 'object',
            properties: {
                since: { type: 'string', description: 'ISO timestamp from request_upload_link' },
            },
            required: ['since'],
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const since = new Date(String(args.since ?? ''))
            if (Number.isNaN(since.getTime())) {
                return 'Pass "since" as the ISO timestamp that request_upload_link returned.'
            }

            const deadline = Date.now() + 40_000
            const payload = ctx.payload

            for (;;) {
                const result = await payload.find({
                    collection: 'media' as never,
                    where: { createdAt: { greater_than: since.toISOString() } } as never,
                    sort: '-createdAt',
                    limit: 20,
                    depth: 0,
                    ...callArgs(ctx),
                })

                if (result.docs.length) {
                    const listed = result.docs
                        .map((doc: any) => `id: ${doc.id}  ${doc.filename}  ${doc.width ?? '?'}x${doc.height ?? '?'}`)
                        .join('\n')
                    const locales = localeCodes(ctx)
                    const altStep = locales.length
                        ? `Describe each one with set_image_alt, once per locale (${locales.join(', ')}), before you place it.`
                        : 'Describe each one with set_image_alt before you place it.'

                    return [
                        `${result.docs.length} new image${result.docs.length === 1 ? '' : 's'}:`,
                        '',
                        listed,
                        '',
                        altStep,
                        'Then place it with set_section_image or set_image, in every locale, and give them a preview link when you are done.',
                    ].join('\n')
                }

                if (Date.now() >= deadline) {
                    return 'Nothing has arrived yet. Call collect_new_images again with the same "since" rather than asking them whether they have uploaded it.'
                }

                await sleep(2000)
            }
        },
    },
    {
        name: 'set_image_alt',
        description:
            "Write an image's description, which is what screen readers announce and what shows if the image fails to load. Describe what is in the picture, not the page it sits on. The description is per locale, so set it in each one.",
        scope: MCP_SCOPES.contentWrite,
        inputSchema: {
            type: 'object',
            properties: {
                mediaId: { type: ['string', 'number'] },
                locale: { type: 'string' },
                alt: { type: 'string' },
            },
            required: ['mediaId', 'locale', 'alt'],
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const alt = String(args.alt ?? '').trim()
            if (!alt) return 'Give a description of what is in the picture.'

            const payload = ctx.payload
            await payload.update({
                collection: 'media' as never,
                id: args.mediaId as string | number,
                locale: args.locale,
                data: { alt } as never,
                ...callArgs(ctx),
            })

            return `Media ${args.mediaId} now reads "${alt}" in ${args.locale}.`
        },
    },
    {
        name: 'get_preview_link',
        description: 'Return the preview URL for a document so the person can read the draft before publishing.',
        scope: MCP_SCOPES.contentRead,
        inputSchema: {
            type: 'object',
            properties: {
                collection: collectionEnum,
                id: { type: ['string', 'number'] },
                locale: { type: 'string' },
            },
            required: ['id', 'locale'],
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const collection = resolveCollection(args.collection)
            const doc = await loadDoc(collection, args.id, undefined, ctx)
            const path = (doc.localizedPaths ?? {})[args.locale]
            if (!path) return `${collection} ${args.id} has no path for locale ${args.locale}.`

            const url = `${ctx.siteUrl}/${args.locale}${path === '/' ? '' : path}`
            const label = doc.name ?? doc.title ?? 'the draft'

            return [
                'Show this to them as a clickable markdown link, exactly as written on the next line. Do not put it in a code block or backticks.',
                '',
                `[${typeof label === 'string' ? label : 'View the draft'}](${url})`,
                '',
                'They need to be signed in on the preview site to see it. A Publish button appears at the top of the page once they are.',
            ].join('\n')
        },
    },
    {
        name: 'request_deletion',
        description:
            "Get a link that opens the delete confirmation on the document's own page. You cannot delete anything yourself. They read the page, choose where its old address should redirect, and type the name to confirm.",
        scope: MCP_SCOPES.contentRead,
        inputSchema: {
            type: 'object',
            properties: {
                collection: collectionEnum,
                id: { type: ['string', 'number'] },
                locale: { type: 'string' },
            },
            required: ['id', 'locale'],
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const collection = resolveCollection(args.collection)
            const doc = await loadDoc(collection, args.id, undefined, ctx)
            const label = doc.name ?? doc.title
            const target = await previewUrlFor(collection, args.id, args.locale, ctx)

            if (!target) return `${collection} ${args.id} has no address for locale ${args.locale}, so there is nothing to open.`

            return [
                `Confirmation link for deleting ${JSON.stringify(label)}. Show it as a clickable markdown link, exactly as written on the next line. Do not put it in a code block or backticks.`,
                '',
                `[Review and delete ${typeof label === 'string' ? label : 'this document'}](${target}?delete=true)`,
                '',
                'It opens the page itself with a confirmation prompt over it. They must be signed in, they choose where the old address redirects so nothing indexed starts returning 404, and they have to type the name to confirm.',
            ].join('\n')
        },
    },
]

export const toolsForScopes = (scopes: string[]): McpTool[] => TOOLS.filter((tool) => scopes.includes(tool.scope))
