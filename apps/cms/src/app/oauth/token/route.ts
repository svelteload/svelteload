import { getPayload } from 'payload'
import config from '@payload-config'
import { getUserRole } from '@cms/access/roles'
import { hashSecret, randomSecret, signAccessToken, verifyPkceChallenge } from '@svelteload/payload/utils/oauthTokens'
import {
    ACCESS_TOKEN_TTL_SECONDS,
    CORS_HEADERS,
    REFRESH_TOKEN_TTL_SECONDS,
    baseUrlFrom,
    preflight,
    resourceUrlFrom,
} from '@cms/oauth/config'

export const dynamic = 'force-dynamic'

export function OPTIONS(): Response {
    return preflight()
}

const fail = (error: string, description: string, status = 400): Response =>
    Response.json({ error, error_description: description }, { status, headers: CORS_HEADERS })

const readBody = async (request: Request): Promise<Record<string, string>> => {
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
        const parsed = (await request.json()) as Record<string, unknown>
        return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v ?? '')]))
    }
    const form = await request.formData()
    return Object.fromEntries(Array.from(form.entries()).map(([k, v]) => [k, String(v)]))
}

const findGrant = async (payload: Awaited<ReturnType<typeof getPayload>>, type: 'code' | 'refresh', secret: string) => {
    const result = await payload.find({
        collection: 'oauth-grants' as never,
        where: {
            and: [{ tokenHash: { equals: hashSecret(secret) } }, { type: { equals: type } }],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
    })
    return (result.docs[0] as Record<string, unknown> | undefined) ?? null
}

const consume = async (payload: Awaited<ReturnType<typeof getPayload>>, id: unknown): Promise<void> => {
    await payload.update({
        collection: 'oauth-grants' as never,
        id: id as never,
        data: { consumedAt: new Date().toISOString() } as never,
        overrideAccess: true,
    })
}

const isSpent = (grant: Record<string, unknown>): boolean => {
    if (grant.consumedAt) return true
    const expiresAt = grant.expiresAt ? Date.parse(String(grant.expiresAt)) : 0
    return !expiresAt || expiresAt <= Date.now()
}

export async function POST(request: Request): Promise<Response> {
    let body: Record<string, string>
    try {
        body = await readBody(request)
    } catch (_) {
        return fail('invalid_request', 'Could not parse the request body.')
    }

    const payload = await getPayload({ config })
    const grantType = body.grant_type

    const issue = async (grant: Record<string, unknown>): Promise<Response> => {
        const userId = grant.user
        const user = await payload
            .findByID({ collection: 'users', id: userId as never, depth: 0, overrideAccess: true })
            .catch(() => null)
        if (!user) return fail('invalid_grant', 'The account behind this grant no longer exists.')

        const scope = String(grant.scope ?? '')
        const refreshToken = randomSecret(32)

        await payload.create({
            collection: 'oauth-grants' as never,
            data: {
                type: 'refresh',
                tokenHash: hashSecret(refreshToken),
                clientId: grant.clientId,
                user: userId,
                scope,
                resource: grant.resource,
                expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString(),
            } as never,
            overrideAccess: true,
        })

        const accessToken = signAccessToken(
            {
                iss: baseUrlFrom(request),
                sub: String(userId),
                aud: String(grant.resource || resourceUrlFrom(request)),
                client_id: String(grant.clientId ?? ''),
                scope,
                role: getUserRole(user) ?? 'reader',
            },
            ACCESS_TOKEN_TTL_SECONDS,
        )

        return Response.json(
            {
                access_token: accessToken,
                token_type: 'Bearer',
                expires_in: ACCESS_TOKEN_TTL_SECONDS,
                refresh_token: refreshToken,
                scope,
            },
            { headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } },
        )
    }

    if (grantType === 'authorization_code') {
        if (!body.code || !body.code_verifier) return fail('invalid_request', 'code and code_verifier are both required.')

        const grant = await findGrant(payload, 'code', body.code)
        if (!grant || isSpent(grant)) return fail('invalid_grant', 'This authorization code is not valid any more.')
        if (body.client_id && body.client_id !== grant.clientId) return fail('invalid_grant', 'This code was issued to a different app.')
        if (body.redirect_uri && body.redirect_uri !== grant.redirectUri) return fail('invalid_grant', 'The redirect address does not match the one used to get this code.')
        if (!verifyPkceChallenge(body.code_verifier, String(grant.codeChallenge ?? ''))) return fail('invalid_grant', 'The PKCE verifier does not match.')

        await consume(payload, grant.id)
        return issue(grant)
    }

    if (grantType === 'refresh_token') {
        if (!body.refresh_token) return fail('invalid_request', 'refresh_token is required.')

        const grant = await findGrant(payload, 'refresh', body.refresh_token)
        if (!grant || isSpent(grant)) return fail('invalid_grant', 'This refresh token is not valid any more.')
        if (body.client_id && body.client_id !== grant.clientId) return fail('invalid_grant', 'This token was issued to a different app.')

        await consume(payload, grant.id)
        return issue(grant)
    }

    return fail('unsupported_grant_type', 'Supported grant types are authorization_code and refresh_token.')
}
