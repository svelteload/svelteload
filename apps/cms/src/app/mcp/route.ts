import { getPayload } from 'payload'
import config from '@payload-config'
import { verifyAccessToken } from '@svelteload/payload/utils/oauthTokens'
import { CORS_HEADERS, baseUrlFrom, preflight } from '@cms/oauth/config'
import { toolsForScopes } from '@cms/mcp/tools'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PROTOCOL_VERSION = '2025-06-18'
const SUPPORTED_PROTOCOLS = new Set([PROTOCOL_VERSION, '2025-03-26', '2024-11-05'])

const SERVER_INSTRUCTIONS = `This server edits one website's content.

How to work:
- Start with list_content to find a document id, then get_document to see its fields, its sections and their sectionIds.
- create_document makes a new page, post, project or tool as a draft. You do not need the CMS admin for this.
- edit_text changes one field inside one section. edit_field changes a plain top-level field such as title or metaDescription. edit_rich_text replaces a body, so read the current one first because it overwrites the whole field.
- rename_url changes an address. Never try to set slug or path through edit_field.
- Images cannot be sent through this connection, so pasting one into the chat does not reach the site. Call request_upload_link, give the person the link, then list_media to pick up the new id. Place it with set_section_image for a page section, or set_image for a blog post's main or social image.
- When a tool hands you a link, relay it as a clickable markdown link in your reply. Never wrap a link in backticks or a code block; it stops being clickable.

Rules that matter:
- Every change saves as a draft. You cannot publish and you cannot delete. When you are done, give the person a preview link from get_preview_link and tell them to read it and publish from that page.
- Deletion needs request_deletion, which returns a confirmation link. The person confirms it themselves.
- This site is multilingual. Editing one locale leaves the other stale, and publishing ships both at once, so whenever you change text in one locale offer to make the matching change in the other before they publish.
- Write in the language of the locale you are editing, and match the surrounding copy's tone rather than defaulting to marketing phrasing.`

export function OPTIONS(): Response {
    return preflight()
}

const unauthorized = (request: Request, detail: string): Response =>
    new Response(JSON.stringify({ error: 'invalid_token', error_description: detail }), {
        status: 401,
        headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
            'WWW-Authenticate': `Bearer realm="mcp", resource_metadata="${baseUrlFrom(request)}/.well-known/oauth-protected-resource"`,
        },
    })

const rpcError = (id: unknown, code: number, message: string): Response =>
    Response.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, { headers: { ...CORS_HEADERS } })

const rpcResult = (id: unknown, result: unknown): Response =>
    Response.json({ jsonrpc: '2.0', id: id ?? null, result }, { headers: { ...CORS_HEADERS } })

export function GET(request: Request): Response {
    return new Response(JSON.stringify({ error: 'method_not_allowed', error_description: 'This server is stateless. Use POST.' }), {
        status: 405,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', Allow: 'POST, OPTIONS' },
    })
}

export async function POST(request: Request): Promise<Response> {
    const authorization = request.headers.get('authorization') ?? ''
    if (!authorization.toLowerCase().startsWith('bearer ')) {
        return unauthorized(request, 'A bearer token is required.')
    }

    const claims = verifyAccessToken(authorization.slice(7).trim())
    if (!claims) return unauthorized(request, 'The access token is missing, malformed or expired.')

    const payload = await getPayload({ config })
    const user = await payload
        .findByID({ collection: 'users', id: claims.sub as never, depth: 0, overrideAccess: true })
        .catch(() => null)
    if (!user) return unauthorized(request, 'The account behind this token no longer exists.')

    const scopes = claims.scope ? claims.scope.split(' ').filter(Boolean) : []
    const tools = toolsForScopes(scopes)

    let body: any
    try {
        body = await request.json()
    } catch (_) {
        return rpcError(null, -32700, 'Parse error')
    }

    if (Array.isArray(body)) return rpcError(null, -32600, 'Batched requests are not supported.')

    const { id, method, params } = body ?? {}

    if (typeof method !== 'string') return rpcError(id, -32600, 'Invalid request')

    if (method.startsWith('notifications/')) {
        return new Response(null, { status: 202, headers: CORS_HEADERS })
    }

    if (method === 'initialize') {
        const requested = params?.protocolVersion
        return rpcResult(id, {
            protocolVersion: SUPPORTED_PROTOCOLS.has(requested) ? requested : PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'svelteload-cms', version: '1.0.0' },
            instructions: SERVER_INSTRUCTIONS,
        })
    }

    if (method === 'ping') return rpcResult(id, {})

    if (method === 'tools/list') {
        return rpcResult(id, {
            tools: tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
            })),
        })
    }

    if (method === 'tools/call') {
        const tool = tools.find((entry) => entry.name === params?.name)
        if (!tool) return rpcError(id, -32602, `Unknown tool "${params?.name}" or it is outside this connection's permissions.`)

        const siteUrl = process.env.PUBLIC_PREVIEW_URL || process.env.PUBLIC_SITE_URL || baseUrlFrom(request)

        try {
            const text = await tool.run(params?.arguments ?? {}, {
                user: user as Record<string, unknown>,
                scopes,
                siteUrl: siteUrl.replace(/\/+$/, ''),
            })
            return rpcResult(id, { content: [{ type: 'text', text }] })
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            return rpcResult(id, { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true })
        }
    }

    return rpcError(id, -32601, `Method "${method}" is not implemented.`)
}
