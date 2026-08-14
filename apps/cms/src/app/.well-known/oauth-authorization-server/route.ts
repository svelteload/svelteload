import { CORS_HEADERS, SUPPORTED_SCOPES, baseUrlFrom, preflight } from '@cms/oauth/config'

export const dynamic = 'force-dynamic'

export function OPTIONS(): Response {
    return preflight()
}

export function GET(request: Request): Response {
    const base = baseUrlFrom(request)

    return Response.json(
        {
            issuer: base,
            authorization_endpoint: `${base}/oauth/authorize`,
            token_endpoint: `${base}/oauth/token`,
            registration_endpoint: `${base}/oauth/register`,
            scopes_supported: SUPPORTED_SCOPES,
            response_types_supported: ['code'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            code_challenge_methods_supported: ['S256'],
            token_endpoint_auth_methods_supported: ['none'],
        },
        { headers: CORS_HEADERS },
    )
}
