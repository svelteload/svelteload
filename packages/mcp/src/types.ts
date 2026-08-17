import type { Payload } from 'payload'

export type ToolContext = {
    /** Injected by the transport so tool code never imports a project's payload config. */
    payload: Payload
    user: Record<string, unknown>
    scopes: string[]
    /** Preview host, used to build the links handed back to the person being helped. */
    siteUrl: string
    /** CMS host, for the links that need an admin session rather than a preview one. */
    cmsUrl: string
}

export type McpTool = {
    name: string
    description: string
    scope: string
    inputSchema: Record<string, unknown>
    run: (args: Record<string, any>, ctx: ToolContext) => Promise<string>
}
