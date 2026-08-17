import type { McpTool, ToolContext } from './types'

export const PROTOCOL_VERSION = '2025-06-18'

const SUPPORTED_PROTOCOLS = new Set([PROTOCOL_VERSION, '2025-03-26', '2024-11-05'])

export const SERVER_INSTRUCTIONS = `This server edits one website's content.

How to work:
- Start with list_content to find a document id, then get_document to see its fields, its sections and their sectionIds.
- create_document makes a new page, post, project or tool as a draft. You do not need the CMS admin for this.
- edit_text changes one field inside one section. edit_field changes a plain top-level field such as title or metaDescription. edit_rich_text replaces a body, so read the current one first because it overwrites the whole field.
- rename_url changes an address. Never try to set slug or path through edit_field.
- Images cannot be sent through this connection, so pasting one into the chat does not reach the site. Call request_upload_link and give the person the link; it opens the uploader on the preview site. Then list_media to pick up the new id. Place it with set_section_image for a page section, or set_image for a blog post's main or social image.
- When a tool hands you a link, relay it as a clickable markdown link in your reply. Never wrap a link in backticks or a code block; it stops being clickable.

Rules that matter:
- Every change saves as a draft. You cannot publish and you cannot delete. When you are done, give the person a preview link from get_preview_link and tell them to read it and publish from that page.
- Deletion needs request_deletion, which returns a link to the document's own page with a confirmation prompt over it. The person reads the page and confirms it themselves.
- This site is multilingual. Editing one locale leaves the other stale, and publishing ships both at once, so whenever you change text in one locale offer to make the matching change in the other before they publish.
- Write in the language of the locale you are editing, and match the surrounding copy's tone rather than defaulting to marketing phrasing.`

export type RpcOutcome =
    | { kind: 'accepted' }
    | { kind: 'result'; id: unknown; result: unknown }
    | { kind: 'error'; id: unknown; code: number; message: string }

export const dispatchMcpRequest = async ({
    body,
    tools,
    ctx,
    serverName,
}: {
    body: any
    tools: McpTool[]
    ctx: ToolContext
    serverName: string
}): Promise<RpcOutcome> => {
    if (Array.isArray(body)) {
        return { kind: 'error', id: null, code: -32600, message: 'Batched requests are not supported.' }
    }

    const { id, method, params } = body ?? {}

    if (typeof method !== 'string') {
        return { kind: 'error', id: id ?? null, code: -32600, message: 'Invalid request' }
    }

    if (method.startsWith('notifications/')) return { kind: 'accepted' }

    if (method === 'initialize') {
        const requested = params?.protocolVersion
        return {
            kind: 'result',
            id,
            result: {
                protocolVersion: SUPPORTED_PROTOCOLS.has(requested) ? requested : PROTOCOL_VERSION,
                capabilities: { tools: { listChanged: false } },
                serverInfo: { name: serverName, version: '1.0.0' },
                instructions: SERVER_INSTRUCTIONS,
            },
        }
    }

    if (method === 'ping') return { kind: 'result', id, result: {} }

    if (method === 'tools/list') {
        return {
            kind: 'result',
            id,
            result: {
                tools: tools.map((tool) => ({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                })),
            },
        }
    }

    if (method === 'tools/call') {
        const tool = tools.find((entry) => entry.name === params?.name)
        if (!tool) {
            return {
                kind: 'error',
                id,
                code: -32602,
                message: `Unknown tool "${params?.name}" or it is outside this connection's permissions.`,
            }
        }

        try {
            const text = await tool.run(params?.arguments ?? {}, ctx)
            return { kind: 'result', id, result: { content: [{ type: 'text', text }] } }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            return { kind: 'result', id, result: { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true } }
        }
    }

    return { kind: 'error', id, code: -32601, message: `Method "${method}" is not implemented.` }
}
