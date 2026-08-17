import type { McpTool, ToolContext } from './types'

const PROTOCOL_VERSION = '2025-06-18'

const SUPPORTED_PROTOCOLS = new Set([PROTOCOL_VERSION, '2025-03-26', '2024-11-05'])

export type RpcOutcome =
    | { kind: 'accepted' }
    | { kind: 'result'; id: unknown; result: unknown }
    | { kind: 'error'; id: unknown; code: number; message: string }

export const dispatchMcpRequest = async ({
    body,
    tools,
    ctx,
    serverName,
    instructions,
}: {
    body: any
    tools: McpTool[]
    ctx: ToolContext
    serverName: string
    instructions: string
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
                instructions,
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
