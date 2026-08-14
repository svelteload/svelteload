import { getPayload } from 'payload'
import config from '@payload-config'
import { getUserRole } from '@cms/access/roles'
import { hashSecret, randomSecret } from '@svelteload/payload/utils/oauthTokens'
import { narrowToGrantable, parseScopeString } from '@svelteload/payload/utils/mcpScopes'
import { AUTH_CODE_TTL_SECONDS } from '@cms/oauth/config'

export const dynamic = 'force-dynamic'

type AuthorizeParams = {
    clientId: string
    redirectUri: string
    state: string
    scope: string
    codeChallenge: string
    codeChallengeMethod: string
    resource: string
}

const escapeHtml = (value: string): string =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const readParams = (source: URLSearchParams | FormData): AuthorizeParams => {
    const get = (key: string): string => {
        const value = source.get(key)
        return typeof value === 'string' ? value : ''
    }
    return {
        clientId: get('client_id'),
        redirectUri: get('redirect_uri'),
        state: get('state'),
        scope: get('scope'),
        codeChallenge: get('code_challenge'),
        codeChallengeMethod: get('code_challenge_method'),
        resource: get('resource'),
    }
}

const errorPage = (title: string, detail: string, status: number): Response =>
    new Response(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
body{font-family:system-ui,sans-serif;background:#111;color:#eee;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
main{max-width:26rem}h1{font-size:1.15rem;margin:0 0 .5rem}p{color:#aaa;line-height:1.55;margin:0}
</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p></main></body></html>`,
        { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )

const consentPage = (params: AuthorizeParams, clientName: string, error?: string): Response => {
    const hidden = Object.entries({
        client_id: params.clientId,
        redirect_uri: params.redirectUri,
        state: params.state,
        scope: params.scope,
        code_challenge: params.codeChallenge,
        code_challenge_method: params.codeChallengeMethod,
        resource: params.resource,
    })
        .map(([key, value]) => `<input type="hidden" name="${key}" value="${escapeHtml(value)}">`)
        .join('')

    return new Response(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect ${escapeHtml(clientName)}</title><style>
body{font-family:system-ui,sans-serif;background:#111;color:#eee;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
form{width:100%;max-width:22rem}h1{font-size:1.15rem;margin:0 0 .35rem}
p.lead{color:#aaa;line-height:1.55;margin:0 0 1.5rem;font-size:.9rem}
label{display:block;font-size:.8rem;color:#bbb;margin:0 0 .35rem}
input[type=email],input[type=password]{width:100%;box-sizing:border-box;padding:.6rem .7rem;margin:0 0 1rem;background:#1c1c1c;border:1px solid #333;border-radius:6px;color:#eee;font-size:.95rem}
button{width:100%;padding:.65rem;background:#eee;color:#111;border:0;border-radius:6px;font-size:.95rem;font-weight:600;cursor:pointer}
ul{margin:0 0 1.5rem;padding-left:1.1rem;color:#aaa;font-size:.85rem;line-height:1.7}
.err{background:#3b1111;border:1px solid #6b2020;color:#ffb4b4;padding:.6rem .7rem;border-radius:6px;margin:0 0 1rem;font-size:.85rem}
</style></head><body><form method="post">
<h1>Connect ${escapeHtml(clientName)}</h1>
<p class="lead">Sign in to let this app read and edit your website content.</p>
${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
<ul><li>Reads pages, posts and media</li><li>Saves changes as drafts for review</li><li>Cannot publish, and cannot delete anything</li></ul>
${hidden}
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required>
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Sign in and connect</button>
</form></body></html>`,
        { status: error ? 401 : 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
}

const loadClient = async (clientId: string) => {
    if (!clientId) return null
    const payload = await getPayload({ config })
    const result = await payload.find({
        collection: 'oauth-clients' as never,
        where: { clientId: { equals: clientId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
    })
    return (result.docs[0] as Record<string, unknown> | undefined) ?? null
}

const redirectUriAllowed = (client: Record<string, unknown>, redirectUri: string): boolean => {
    const uris = (client.redirectUris ?? []) as Array<{ uri?: string | null }>
    return uris.some((entry) => entry?.uri === redirectUri)
}

const validate = async (params: AuthorizeParams) => {
    const client = await loadClient(params.clientId)
    if (!client) return { error: errorPage('Unknown app', 'This connector is not registered with this site. Remove it and add it again.', 400) }
    if (!params.redirectUri || !redirectUriAllowed(client, params.redirectUri)) {
        return { error: errorPage('Redirect mismatch', 'The redirect address does not match what this app registered.', 400) }
    }
    if (params.codeChallengeMethod !== 'S256' || !params.codeChallenge) {
        return { error: errorPage('Unsupported request', 'This server requires PKCE with S256.', 400) }
    }
    return { client }
}

export async function GET(request: Request): Promise<Response> {
    const params = readParams(new URL(request.url).searchParams)
    const outcome = await validate(params)
    if (outcome.error) return outcome.error

    return consentPage(params, (outcome.client!.clientName as string) || 'this app')
}

export async function POST(request: Request): Promise<Response> {
    const form = await request.formData()
    const params = readParams(form)
    const outcome = await validate(params)
    if (outcome.error) return outcome.error

    const clientName = (outcome.client!.clientName as string) || 'this app'
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')

    const payload = await getPayload({ config })

    let user: Record<string, unknown> | null = null
    try {
        const result = await payload.login({
            collection: 'users',
            data: { email, password },
        })
        user = (result.user as Record<string, unknown> | undefined) ?? null
    } catch (_) {
        user = null
    }

    if (!user) return consentPage(params, clientName, 'Those details did not match an account on this site.')

    const role = getUserRole(user)
    const granted = narrowToGrantable(parseScopeString(params.scope), role)

    const code = randomSecret(32)
    await payload.create({
        collection: 'oauth-grants' as never,
        data: {
            type: 'code',
            tokenHash: hashSecret(code),
            clientId: params.clientId,
            user: user.id,
            scope: granted.join(' '),
            redirectUri: params.redirectUri,
            codeChallenge: params.codeChallenge,
            resource: params.resource,
            expiresAt: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000).toISOString(),
        } as never,
        overrideAccess: true,
    })

    const target = new URL(params.redirectUri)
    target.searchParams.set('code', code)
    if (params.state) target.searchParams.set('state', params.state)

    return Response.redirect(target.toString(), 302)
}
