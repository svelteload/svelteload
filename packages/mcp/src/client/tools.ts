import { MCP_SCOPES } from '@svelteload/payload/utils/mcpScopes'
import type { McpTool, ToolContext } from '../types'
import {
    lexicalContainsUneditableNodes,
    lexicalToMarkdown,
    markdownToLexical,
} from '@svelteload/payload/utils/lexicalText'
import { generateSlugFromName } from '@svelteload/payload/utils/generateSlugFromName'

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

const PLAIN_TEXT_FIELDS = new Set(['name', 'title', 'metaTitle', 'metaDescription', 'excerpt', 'subtitle', 'summary'])

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

const TEXTUAL_KEYS = new Set([
    'heading', 'title', 'name', 'description', 'text', 'label', 'subheading', 'quote', 'caption', 'buttonText', 'eyebrow',
])

const isLexical = (value: unknown): boolean =>
    Boolean(value && typeof value === 'object' && 'root' in (value as Record<string, unknown>))

const summarise = (value: unknown): string | null => {
    if (typeof value === 'string') return value.length > 300 ? `${value.slice(0, 300)}…` : value
    if (isLexical(value)) {
        const markdown = lexicalToMarkdown(value)
        return markdown ? `[rich text, use edit_rich_text]\n${markdown.replace(/^/gm, '        ')}` : '[empty rich text]'
    }
    return null
}

const describeSection = (section: Record<string, unknown>, index: number): string => {
    const lines = [`  [${index}] blockType: ${section.blockType} · sectionId: ${section.id}`]
    for (const [key, value] of Object.entries(section)) {
        if (key === 'id' || key === 'blockType') continue
        const rendered = summarise(value)
        if (rendered !== null && (TEXTUAL_KEYS.has(key) || typeof value === 'string')) {
            lines.push(`      ${key}: ${rendered}`)
        }
    }
    return lines.join('\n')
}

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

const identifyingFields = (doc: any): Record<string, unknown> => {
    const data: Record<string, unknown> = {}
    if (typeof doc?.slug === 'string' && doc.slug) data.slug = doc.slug
    if (typeof doc?.path === 'string' && doc.path) data.path = doc.path
    return data
}

export const CLIENT_INSTRUCTIONS = `This server edits one website's content.

How to work:
- Start with list_content to find a document id, then get_document to see its fields, its sections and their sectionIds.
- create_document makes a new page, post, project or tool as a draft. You do not need the CMS admin for this.
- edit_text changes one field inside one section. edit_field changes a plain top-level field such as title or metaDescription. edit_rich_text replaces a body, so read the current one first because it overwrites the whole field.
- rename_url changes an address. Never try to set slug or path through edit_field.
- Images cannot be sent through this connection, so pasting one into the chat does not reach the site. Give the person a preview link from get_preview_link and ask them to use the Upload image button in the bar at the top. Then call list_media to pick up the new id. Place it with set_section_image for a page section, or set_image for a blog post's main or social image.
- When a tool hands you a link, relay it as a clickable markdown link in your reply. Never wrap a link in backticks or a code block; it stops being clickable.

Rules that matter:
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
            'Read one document in one locale, flattened into a readable list. Sections show their sectionId and the text fields that edit_text can change.',
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
            const doc = await loadDoc(collection, args.id, args.locale, ctx)

            const lines = [
                `${collection} ${doc.id} · ${doc.name ?? doc.title} · path ${doc.path ?? '(derived)'} · status ${doc._status ?? 'unknown'} · locale ${args.locale}`,
            ]

            for (const key of ['title', 'name', 'metaTitle', 'metaDescription', 'excerpt']) {
                const rendered = summarise(doc[key])
                if (rendered) lines.push(`  ${key}: ${rendered}`)
            }

            const sections = Array.isArray(doc.sections) ? doc.sections : []
            if (sections.length) {
                lines.push('sections:')
                lines.push(...sections.map((section: any, index: number) => describeSection(section, index)))
            }

            for (const key of ['content', 'body']) {
                if (!isLexical(doc[key])) continue
                const markdown = lexicalToMarkdown(doc[key])
                lines.push(`${key} (edit with edit_rich_text):`)
                lines.push(markdown ? markdown.replace(/^/gm, '  ') : '  (empty)')
                if (lexicalContainsUneditableNodes(doc[key])) {
                    lines.push('  NOTE: this body embeds images or blocks, so edit_rich_text will refuse to replace it.')
                }
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
            'Change one text field inside one section, in one locale, and save as a draft. Block ids are preserved so the other locale keeps its content. Never publishes.',
        scope: MCP_SCOPES.contentWrite,
        inputSchema: {
            type: 'object',
            properties: {
                collection: collectionEnum,
                id: { type: ['string', 'number'] },
                sectionId: { type: 'string' },
                field: { type: 'string' },
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
            const target = sections.find((section: any) => String(section.id) === String(args.sectionId))
            if (!target) return `No section with id ${args.sectionId} on ${collection} ${args.id}.`

            const existing = target[args.field]
            if (existing !== undefined && existing !== null && typeof existing !== 'string') {
                return `Field "${args.field}" is not plain text, so edit_text cannot change it.`
            }
            target[args.field] = args.value

            await payload.update({
                collection: collection as never,
                id: args.id,
                locale: args.locale,
                draft: true,
                data: { ...identifyingFields(doc), sections, _status: 'draft' } as never,
                ...callArgs(ctx),
            })

            return `Saved as a draft. ${collection} ${args.id}, section ${args.sectionId}, field "${args.field}" (${args.locale}) is now:\n${args.value}`
        },
    },
    {
        name: 'edit_field',
        description: `Change one plain text field on a document in one locale. Saves as a draft. Allowed fields: ${[...PLAIN_TEXT_FIELDS].join(', ')}. Use edit_text for section content, edit_rich_text for a body, and rename_url to change an address.`,
        scope: MCP_SCOPES.contentWrite,
        inputSchema: {
            type: 'object',
            properties: {
                collection: collectionEnum,
                id: { type: ['string', 'number'] },
                field: { type: 'string', enum: [...PLAIN_TEXT_FIELDS] },
                locale: { type: 'string' },
                value: { type: 'string' },
            },
            required: ['id', 'field', 'locale', 'value'],
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const collection = resolveCollection(args.collection)

            if (!PLAIN_TEXT_FIELDS.has(args.field)) {
                if (args.field === 'sections') return 'Use edit_text to change a section.'
                if (args.field === 'content' || args.field === 'body') return 'Use edit_rich_text to change a body.'
                if (args.field === 'slug' || args.field === 'path') return 'Use rename_url to change an address, so the old one gets redirected.'
                return `"${args.field}" cannot be set through this connection. Editable fields are: ${[...PLAIN_TEXT_FIELDS].join(', ')}.`
            }

            if (args.field === 'metaDescription' && String(args.value).length > MAX_META_DESCRIPTION) {
                return `metaDescription is capped at ${MAX_META_DESCRIPTION} characters by the schema. It is currently ${String(args.value).length}. Shorten it and try again.`
            }

            const payload = ctx.payload
            const doc = await loadDoc(collection, args.id, args.locale, ctx)

            await payload.update({
                collection: collection as never,
                id: args.id,
                locale: args.locale,
                draft: true,
                data: { ...identifyingFields(doc), [args.field]: args.value, _status: 'draft' } as never,
                ...callArgs(ctx),
            })

            return `Saved as a draft. ${collection} ${args.id} field "${args.field}" (${args.locale}) is now:\n${args.value}`
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
            'Replace the body of a document, such as a blog post, and save as a draft. Write plain prose with a blank line between paragraphs. Use ## for a subheading, - for bullets, > for a quote and **bold** for emphasis. Read the current body with get_document first, because this replaces the whole field rather than editing part of it.',
        scope: MCP_SCOPES.contentWrite,
        inputSchema: {
            type: 'object',
            properties: {
                collection: collectionEnum,
                id: { type: ['string', 'number'] },
                locale: { type: 'string' },
                value: { type: 'string' },
                field: { type: 'string', description: 'Defaults to "content".' },
            },
            required: ['id', 'locale', 'value'],
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const collection = resolveCollection(args.collection)
            const field = typeof args.field === 'string' && args.field ? args.field : 'content'
            const payload = ctx.payload
            const doc = await loadDoc(collection, args.id, args.locale, ctx)

            const existing = doc[field]
            if (existing !== undefined && existing !== null && !isLexical(existing)) {
                return `Field "${field}" is not rich text. Use edit_field for plain text or edit_text for section content.`
            }
            if (lexicalContainsUneditableNodes(existing)) {
                return `The current "${field}" embeds images or blocks. Replacing it would delete them, so this has to be edited in the CMS instead.`
            }

            await payload.update({
                collection: collection as never,
                id: args.id,
                locale: args.locale,
                draft: true,
                data: { ...identifyingFields(doc), [field]: markdownToLexical(args.value), _status: 'draft' } as never,
                ...callArgs(ctx),
            })

            const roundTrip = lexicalToMarkdown(markdownToLexical(args.value))
            return `Saved as a draft. ${collection} ${args.id} "${field}" (${args.locale}) now reads:\n\n${roundTrip}`
        },
    },
    {
        name: 'set_section_image',
        description: 'Point a section image field at an existing media item and save as a draft.',
        scope: MCP_SCOPES.contentWrite,
        inputSchema: {
            type: 'object',
            properties: {
                collection: collectionEnum,
                id: { type: ['string', 'number'] },
                sectionId: { type: 'string' },
                field: { type: 'string' },
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
            const target = sections.find((section: any) => String(section.id) === String(args.sectionId))
            if (!target) return `No section with id ${args.sectionId} on ${collection} ${args.id}.`

            target[args.field] = args.mediaId

            await payload.update({
                collection: collection as never,
                id: args.id,
                locale: args.locale,
                draft: true,
                data: { ...identifyingFields(doc), sections, _status: 'draft' } as never,
                ...callArgs(ctx),
            })

            return `Saved as a draft. Section ${args.sectionId} field "${args.field}" now points at media ${args.mediaId}.`
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
