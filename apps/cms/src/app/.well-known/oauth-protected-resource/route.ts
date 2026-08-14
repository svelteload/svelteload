import { CORS_HEADERS, SUPPORTED_SCOPES, baseUrlFrom, preflight, resourceUrlFrom } from '@cms/oauth/config'

export const dynamic = 'force-dynamic'

export function OPTIONS(): Response {
    return preflight()
}

export function GET(request: Request): Response {
    return Response.json(
        {
            resource: resourceUrlFrom(request),
            authorization_servers: [baseUrlFrom(request)],
            scopes_supported: SUPPORTED_SCOPES,
            bearer_methods_supported: ['header'],
        },
        { headers: CORS_HEADERS },
    )
}
