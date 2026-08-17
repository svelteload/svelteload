import { getPayload } from 'payload'
import config from '@payload-config'
import { verifyAccessToken } from '@svelteload/payload/utils/oauthTokens'
import { CORS_HEADERS, baseUrlFrom, preflight } from '@cms/oauth/config'
import { dispatchMcpRequest, toolsForScopes, CLIENT_INSTRUCTIONS } from '@svelteload/mcp'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

export function GET(): Response {
    return new Response(
        JSON.stringify({ error: 'method_not_allowed', error_description: 'This server is stateless. Use POST.' }),
        { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', Allow: 'POST, OPTIONS' } },
    )
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

    let body: unknown
    try {
        body = await request.json()
    } catch (_) {
        return Response.json(
            { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
            { headers: CORS_HEADERS },
        )
    }

    const scopes = claims.scope ? claims.scope.split(' ').filter(Boolean) : []
    const siteUrl = process.env.PUBLIC_PREVIEW_URL || process.env.PUBLIC_SITE_URL || baseUrlFrom(request)

    const outcome = await dispatchMcpRequest({
        body,
        tools: toolsForScopes(scopes),
        serverName: 'svelteload-cms',
        instructions: CLIENT_INSTRUCTIONS,
        ctx: {
            payload,
            user: user as Record<string, unknown>,
            scopes,
            siteUrl: siteUrl.replace(/\/+$/, ''),
            cmsUrl: baseUrlFrom(request).replace(/\/+$/, ''),
        },
    })

    if (outcome.kind === 'accepted') return new Response(null, { status: 202, headers: CORS_HEADERS })

    if (outcome.kind === 'error') {
        return Response.json(
            { jsonrpc: '2.0', id: outcome.id ?? null, error: { code: outcome.code, message: outcome.message } },
            { headers: CORS_HEADERS },
        )
    }

    return Response.json({ jsonrpc: '2.0', id: outcome.id ?? null, result: outcome.result }, { headers: CORS_HEADERS })
}
