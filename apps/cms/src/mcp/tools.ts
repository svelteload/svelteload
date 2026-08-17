import { getPayload } from 'payload'
import config from '@payload-config'
import { MCP_SCOPES, type McpScope } from '@svelteload/payload/utils/mcpScopes'
import { ACTION_TOKEN_TTL_SECONDS, signActionToken } from '@svelteload/payload/utils/actionTokens'
import {
    lexicalContainsUneditableNodes,
    lexicalToMarkdown,
    markdownToLexical,
} from '@svelteload/payload/utils/lexicalText'

export type ToolContext = {
    user: Record<string, unknown>
    scopes: string[]
    siteUrl: string
}

export type McpTool = {
    name: string
    description: string
    scope: McpScope
    inputSchema: Record<string, unknown>
    run: (args: Record<string, any>, ctx: ToolContext) => Promise<string>
}

const EDITABLE_COLLECTIONS = ['pages', 'blog', 'projects', 'tools'] as const

const collectionEnum = {
    type: 'string',
    enum: EDITABLE_COLLECTIONS,
    description: 'Which kind of document. Defaults to "pages".',
}

const resolveCollection = (value: unknown): string => {
    const slug = typeof value === 'string' && value ? value : 'pages'
    if (!(EDITABLE_COLLECTIONS as readonly string[]).includes(slug)) {
        throw new Error(`"${slug}" is not editable through this connection. Use one of: ${EDITABLE_COLLECTIONS.join(', ')}.`)
    }
    return slug
}

const payloadFor = async () => getPayload({ config })

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
    const payload = await payloadFor()
    return payload.findByID({
        collection: collection as never,
        id: id as string | number,
        locale: (locale ?? 'all') as never,
        depth: 0,
        draft: true,
        ...callArgs(ctx),
    }) as Promise<any>
}

const identifyingFields = (doc: any): Record<string, unknown> => {
    const data: Record<string, unknown> = {}
    if (typeof doc?.slug === 'string' && doc.slug) data.slug = doc.slug
    if (typeof doc?.path === 'string' && doc.path) data.path = doc.path
    return data
}

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
            const payload = await payloadFor()
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
            const payload = await payloadFor()
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
        description:
            'Change a top-level text field on a document, such as title, metaTitle or metaDescription, in one locale. Saves as a draft.',
        scope: MCP_SCOPES.contentWrite,
        inputSchema: {
            type: 'object',
            properties: {
                collection: collectionEnum,
                id: { type: ['string', 'number'] },
                field: { type: 'string' },
                locale: { type: 'string' },
                value: { type: 'string' },
            },
            required: ['id', 'field', 'locale', 'value'],
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const collection = resolveCollection(args.collection)
            if (args.field === 'sections' || args.field === 'content') {
                return `Use edit_text for section content. "${args.field}" cannot be set as plain text.`
            }
            if (args.field === 'metaDescription' && String(args.value).length > 200) {
                return 'metaDescription is capped at 200 characters by the schema. Shorten it and try again.'
            }

            const payload = await payloadFor()
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
            const payload = await payloadFor()
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
            const payload = await payloadFor()
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
        name: 'list_media',
        description: 'List images already in the media library, newest first. Use an id with set_section_image.',
        scope: MCP_SCOPES.contentRead,
        inputSchema: {
            type: 'object',
            properties: { limit: { type: 'number' } },
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const payload = await payloadFor()
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
            'Get a one-time link the person can open to drop an image straight into the media library. Use this whenever they want to add a picture, because images cannot be passed through this connection directly. When they are done, call list_media to pick up the new id.',
        scope: MCP_SCOPES.mediaWrite,
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        run: async (_args, ctx) => {
            const token = signActionToken({ act: 'upload', sub: String(ctx.user.id) }, ACTION_TOKEN_TTL_SECONDS)
            return `Send them this link. It works for 30 minutes:\n${ctx.siteUrl}/preview-upload/${token}\n\nAfter they upload, call list_media to get the new image id.`
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
            return `${ctx.siteUrl}/${args.locale}${path === '/' ? '' : path}`
        },
    },
    {
        name: 'request_deletion',
        description:
            'Get a confirmation link for deleting a document. You cannot delete anything yourself. The person opens the link, checks the page, chooses where its old address should redirect, and types the name to confirm.',
        scope: MCP_SCOPES.contentRead,
        inputSchema: {
            type: 'object',
            properties: {
                collection: collectionEnum,
                id: { type: ['string', 'number'] },
            },
            required: ['id'],
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const collection = resolveCollection(args.collection)
            const doc = await loadDoc(collection, args.id, undefined, ctx)
            const label = doc.name ?? doc.title

            const token = signActionToken(
                { act: 'delete', collection, docId: String(args.id), sub: String(ctx.user.id) },
                ACTION_TOKEN_TTL_SECONDS,
            )

            return `Send them this link to confirm deleting ${JSON.stringify(label)}. It works for 30 minutes and they must be signed in:\n${ctx.siteUrl}/preview-delete/${token}\n\nThe page will ask where the old address should redirect to, so nothing that is already indexed starts returning 404.`
        },
    },
]

export const toolsForScopes = (scopes: string[]): McpTool[] => TOOLS.filter((tool) => scopes.includes(tool.scope))
