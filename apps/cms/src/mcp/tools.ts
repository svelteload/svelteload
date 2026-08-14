import { getPayload } from 'payload'
import config from '@payload-config'
import { MCP_SCOPES, type McpScope } from '@svelteload/payload/utils/mcpScopes'

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

const payloadFor = async () => getPayload({ config })

const callArgs = (ctx: ToolContext) => ({
    user: ctx.user as never,
    overrideAccess: false,
    context: { mcpScopes: ctx.scopes },
})

const TEXTUAL_KEYS = new Set(['heading', 'title', 'name', 'description', 'text', 'label', 'subheading', 'content', 'body', 'quote', 'caption'])

const summariseValue = (value: unknown): string | null => {
    if (typeof value === 'string') return value.length > 300 ? `${value.slice(0, 300)}…` : value
    if (value && typeof value === 'object' && 'root' in (value as Record<string, unknown>)) return '[rich text]'
    return null
}

const describeSection = (section: Record<string, unknown>, index: number): string => {
    const lines: string[] = [`  [${index}] blockType: ${section.blockType} · sectionId: ${section.id}`]
    for (const [key, value] of Object.entries(section)) {
        if (key === 'id' || key === 'blockType') continue
        const summary = summariseValue(value)
        if (summary !== null && (TEXTUAL_KEYS.has(key) || typeof value === 'string')) {
            lines.push(`      ${key}: ${summary}`)
        }
    }
    return lines.join('\n')
}

export const TOOLS: McpTool[] = [
    {
        name: 'list_pages',
        description: 'List every page on the site with its id, name and URL path per locale. Start here to find the id of the page you want to change.',
        scope: MCP_SCOPES.contentRead,
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        run: async (_args, ctx) => {
            const payload = await payloadFor()
            const result = await payload.find({
                collection: 'pages' as never,
                limit: 200,
                depth: 0,
                draft: true,
                locale: 'all' as never,
                sort: 'name',
                ...callArgs(ctx),
            })
            if (!result.docs.length) return 'No pages found.'
            return result.docs
                .map((doc: any) => {
                    const paths = doc.localizedPaths ?? {}
                    const rendered = Object.entries(paths).map(([locale, path]) => `${locale}:${path}`).join('  ')
                    return `id: ${doc.id}  status: ${doc._status ?? 'unknown'}  ${rendered}\n    name: ${JSON.stringify(doc.name)}`
                })
                .join('\n')
        },
    },
    {
        name: 'get_page',
        description: 'Read one page in a single locale, flattened into a readable list of sections. Each section shows its sectionId and the text fields you can change with edit_text.',
        scope: MCP_SCOPES.contentRead,
        inputSchema: {
            type: 'object',
            properties: {
                pageId: { type: ['string', 'number'], description: 'Page id from list_pages' },
                locale: { type: 'string', description: 'Locale code, e.g. "en" or "sv"' },
            },
            required: ['pageId', 'locale'],
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const payload = await payloadFor()
            const doc: any = await payload.findByID({
                collection: 'pages' as never,
                id: args.pageId,
                locale: args.locale,
                depth: 0,
                draft: true,
                ...callArgs(ctx),
            })
            const sections = Array.isArray(doc.sections) ? doc.sections : []
            const header = `page ${doc.id} · ${doc.name} · path ${doc.path} · status ${doc._status ?? 'unknown'} · locale ${args.locale}`
            if (!sections.length) return `${header}\n(no sections)`
            return `${header}\nsections:\n${sections.map((s: any, i: number) => describeSection(s, i)).join('\n')}`
        },
    },
    {
        name: 'edit_text',
        description:
            'Change one text field inside one section of a page, in one locale, and save it as a draft. Block ids are preserved automatically so the other locale keeps its content. Never publishes.',
        scope: MCP_SCOPES.contentWrite,
        inputSchema: {
            type: 'object',
            properties: {
                pageId: { type: ['string', 'number'] },
                sectionId: { type: 'string', description: 'sectionId from get_page' },
                field: { type: 'string', description: 'Field name within that section, e.g. "heading"' },
                locale: { type: 'string' },
                value: { type: 'string' },
            },
            required: ['pageId', 'sectionId', 'field', 'locale', 'value'],
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const payload = await payloadFor()
            const doc: any = await payload.findByID({
                collection: 'pages' as never,
                id: args.pageId,
                locale: args.locale,
                depth: 0,
                draft: true,
                ...callArgs(ctx),
            })

            const sections = Array.isArray(doc.sections) ? doc.sections : []
            const target = sections.find((section: any) => String(section.id) === String(args.sectionId))
            if (!target) return `No section with id ${args.sectionId} on page ${args.pageId}.`

            const existing = target[args.field]
            if (existing !== undefined && existing !== null && typeof existing !== 'string') {
                return `Field "${args.field}" on that section is not plain text, so edit_text cannot change it.`
            }
            target[args.field] = args.value

            await payload.update({
                collection: 'pages' as never,
                id: args.pageId,
                locale: args.locale,
                draft: true,
                data: { sections, _status: 'draft' } as never,
                ...callArgs(ctx),
            })

            return `Saved as a draft. Section ${args.sectionId} field "${args.field}" on page ${args.pageId} (${args.locale}) is now:\n${args.value}`
        },
    },
    {
        name: 'list_media',
        description: 'List images already uploaded to the site, newest first, with their ids and dimensions. Use an id with set_section_image.',
        scope: MCP_SCOPES.contentRead,
        inputSchema: {
            type: 'object',
            properties: { limit: { type: 'number', description: 'How many to return, default 40' } },
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
        name: 'set_section_image',
        description: 'Point a section image field at an existing media item and save the page as a draft.',
        scope: MCP_SCOPES.contentWrite,
        inputSchema: {
            type: 'object',
            properties: {
                pageId: { type: ['string', 'number'] },
                sectionId: { type: 'string' },
                field: { type: 'string', description: 'Image field name, usually "image"' },
                mediaId: { type: ['string', 'number'] },
                locale: { type: 'string' },
            },
            required: ['pageId', 'sectionId', 'field', 'mediaId', 'locale'],
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const payload = await payloadFor()
            const doc: any = await payload.findByID({
                collection: 'pages' as never,
                id: args.pageId,
                locale: args.locale,
                depth: 0,
                draft: true,
                ...callArgs(ctx),
            })
            const sections = Array.isArray(doc.sections) ? doc.sections : []
            const target = sections.find((section: any) => String(section.id) === String(args.sectionId))
            if (!target) return `No section with id ${args.sectionId} on page ${args.pageId}.`

            target[args.field] = args.mediaId

            await payload.update({
                collection: 'pages' as never,
                id: args.pageId,
                locale: args.locale,
                draft: true,
                data: { sections, _status: 'draft' } as never,
                ...callArgs(ctx),
            })

            return `Saved as a draft. Section ${args.sectionId} field "${args.field}" now points at media ${args.mediaId}.`
        },
    },
    {
        name: 'get_preview_link',
        description: 'Return the preview URL for a page so the person you are helping can read the draft before publishing.',
        scope: MCP_SCOPES.contentRead,
        inputSchema: {
            type: 'object',
            properties: {
                pageId: { type: ['string', 'number'] },
                locale: { type: 'string' },
            },
            required: ['pageId', 'locale'],
            additionalProperties: false,
        },
        run: async (args, ctx) => {
            const payload = await payloadFor()
            const doc: any = await payload.findByID({
                collection: 'pages' as never,
                id: args.pageId,
                locale: 'all' as never,
                depth: 0,
                draft: true,
                ...callArgs(ctx),
            })
            const path = (doc.localizedPaths ?? {})[args.locale]
            if (!path) return `Page ${args.pageId} has no path for locale ${args.locale}.`
            return `${ctx.siteUrl}/${args.locale}${path === '/' ? '' : path}`
        },
    },
]

export const toolsForScopes = (scopes: string[]): McpTool[] => TOOLS.filter((tool) => scopes.includes(tool.scope))
