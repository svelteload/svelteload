import { ALL_SCOPES } from '@svelteload/payload/utils/mcpScopes'

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30
export const AUTH_CODE_TTL_SECONDS = 60 * 5

export const SUPPORTED_SCOPES = ALL_SCOPES

export const baseUrlFrom = (request: Request): string => {
    const configured = process.env.PUBLIC_PAYLOAD_ADMIN_URL
    if (configured) return configured.replace(/\/+$/, '')

    const url = new URL(request.url)
    const host = request.headers.get('x-forwarded-host') ?? url.host
    const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
    return `${proto}://${host}`
}

export const resourceUrlFrom = (request: Request): string => `${baseUrlFrom(request)}/mcp`

export const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version',
    'Access-Control-Max-Age': '86400',
}

export const preflight = (): Response => new Response(null, { status: 204, headers: CORS_HEADERS })
