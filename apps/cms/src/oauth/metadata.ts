import { CORS_HEADERS, SUPPORTED_SCOPES, baseUrlFrom, resourceUrlFrom } from './config'

export const authorizationServerMetadata = (request: Request): Response => {
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

export const protectedResourceMetadata = (request: Request): Response =>
    Response.json(
        {
            resource: resourceUrlFrom(request),
            authorization_servers: [baseUrlFrom(request)],
            scopes_supported: SUPPORTED_SCOPES,
            bearer_methods_supported: ['header'],
        },
        { headers: CORS_HEADERS },
    )
