import { getPayload } from 'payload'
import config from '@payload-config'
import { randomSecret } from '@svelteload/payload/utils/oauthTokens'
import { CORS_HEADERS, preflight } from '@cms/oauth/config'

export const dynamic = 'force-dynamic'

const REGISTRATIONS_PER_HOUR = 20

export function OPTIONS(): Response {
    return preflight()
}

const invalid = (description: string): Response =>
    Response.json({ error: 'invalid_client_metadata', error_description: description }, { status: 400, headers: CORS_HEADERS })

export async function POST(request: Request): Promise<Response> {
    let body: Record<string, unknown>
    try {
        body = (await request.json()) as Record<string, unknown>
    } catch (_) {
        return invalid('Request body must be JSON.')
    }

    const redirectUris = body.redirect_uris
    if (!Array.isArray(redirectUris) || !redirectUris.length) {
        return invalid('redirect_uris is required and must contain at least one URI.')
    }

    for (const uri of redirectUris) {
        if (typeof uri !== 'string') return invalid('Every redirect_uri must be a string.')
        let parsed: URL
        try {
            parsed = new URL(uri)
        } catch (_) {
            return invalid(`redirect_uri "${uri}" is not a valid absolute URI.`)
        }
        const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1'
        if (parsed.protocol !== 'https:' && !isLoopback && parsed.protocol === 'http:') {
            return invalid(`redirect_uri "${uri}" must use https unless it points at loopback.`)
        }
    }

    const payload = await getPayload({ config })

    const recent = await payload.count({
        collection: 'oauth-clients' as never,
        where: { createdAt: { greater_than: new Date(Date.now() - 60 * 60 * 1000).toISOString() } },
        overrideAccess: true,
    })

    if (recent.totalDocs >= REGISTRATIONS_PER_HOUR) {
        return Response.json(
            {
                error: 'temporarily_unavailable',
                error_description: 'Too many apps have registered recently. Try again later.',
            },
            { status: 429, headers: { ...CORS_HEADERS, 'Retry-After': '3600' } },
        )
    }

    const clientId = randomSecret(24)

    await payload.create({
        collection: 'oauth-clients' as never,
        data: {
            clientId,
            clientName: typeof body.client_name === 'string' ? body.client_name : 'Unnamed connector',
            redirectUris: redirectUris.map((uri) => ({ uri })),
            tokenEndpointAuthMethod: 'none',
        } as never,
        overrideAccess: true,
    })

    return Response.json(
        {
            client_id: clientId,
            client_id_issued_at: Math.floor(Date.now() / 1000),
            client_name: body.client_name ?? 'Unnamed connector',
            redirect_uris: redirectUris,
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
        },
        { status: 201, headers: CORS_HEADERS },
    )
}
