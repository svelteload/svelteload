import { getPayload } from 'payload'
import config from '@payload-config'
import { getUserRole } from '@cms/access/roles'
import { hashSecret, randomSecret, consentSignature } from '@svelteload/payload/utils/oauthTokens'
import { narrowToGrantable, parseScopeString } from '@svelteload/payload/utils/mcpScopes'
import { AUTH_CODE_TTL_SECONDS, baseUrlFrom } from '@cms/oauth/config'

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

const authorizeUrlFrom = (params: AuthorizeParams): string => {
    const query = new URLSearchParams({
        client_id: params.clientId,
        redirect_uri: params.redirectUri,
        state: params.state,
        scope: params.scope,
        code_challenge: params.codeChallenge,
        code_challenge_method: params.codeChallengeMethod,
        resource: params.resource,
    })
    return `/oauth/authorize?${query.toString()}`
}

const PAGE_CSS = `
body{font-family:system-ui,sans-serif;background:#111;color:#eee;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
main,form{width:100%;max-width:24rem}h1{font-size:1.15rem;margin:0 0 .35rem}
p.lead{color:#aaa;line-height:1.55;margin:0 0 1.25rem;font-size:.9rem}
ul{margin:0 0 1.25rem;padding-left:1.1rem;color:#aaa;font-size:.85rem;line-height:1.7}
.who{color:#777;font-size:.8rem;margin:0 0 1.25rem}
.row{display:flex;gap:.6rem}
button{flex:1;padding:.65rem;border:0;border-radius:6px;font-size:.95rem;font-weight:600;cursor:pointer}
button.approve{background:#eee;color:#111}
button.deny{background:#1c1c1c;color:#ccc;border:1px solid #333}
`

const errorPage = (title: string, detail: string, status: number): Response =>
    new Response(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${PAGE_CSS}</style></head><body><main><h1>${escapeHtml(title)}</h1><p class="lead">${escapeHtml(detail)}</p></main></body></html>`,
        { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )

const consentPage = (
    params: AuthorizeParams,
    clientName: string,
    userLabel: string,
    consent: string,
): Response => {
    const hidden = Object.entries({
        client_id: params.clientId,
        redirect_uri: params.redirectUri,
        state: params.state,
        scope: params.scope,
        code_challenge: params.codeChallenge,
        code_challenge_method: params.codeChallengeMethod,
        resource: params.resource,
        consent,
    })
        .map(([key, value]) => `<input type="hidden" name="${key}" value="${escapeHtml(value)}">`)
        .join('')

    return new Response(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect ${escapeHtml(clientName)}</title><style>${PAGE_CSS}</style></head><body><form method="post">
<h1>Connect ${escapeHtml(clientName)}</h1>
<p class="lead">This app is asking to read and edit the content on this site.</p>
<ul><li>Reads pages, posts and media</li><li>Saves changes as drafts for review</li><li>Cannot publish, and cannot delete anything</li></ul>
<p class="who">Signed in as ${escapeHtml(userLabel)}</p>
${hidden}
<div class="row"><button type="submit" name="decision" value="deny" class="deny">Cancel</button><button type="submit" name="decision" value="approve" class="approve">Connect</button></div>
</form></body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
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

const currentUser = async (request: Request) => {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    if (!user) return null
    return user as unknown as Record<string, unknown>
}

const signIn = (request: Request, params: AuthorizeParams): Response =>
    Response.redirect(
        `${baseUrlFrom(request)}/admin/login?redirect=${encodeURIComponent(authorizeUrlFrom(params))}`,
        302,
    )

export async function GET(request: Request): Promise<Response> {
    const params = readParams(new URL(request.url).searchParams)
    const outcome = await validate(params)
    if (outcome.error) return outcome.error

    const user = await currentUser(request)
    if (!user) return signIn(request, params)

    const clientName = (outcome.client!.clientName as string) || 'this app'
    const label = String(user.email ?? user.id ?? 'this account')

    return consentPage(params, clientName, label, consentSignature(request, user.id, params.clientId, params.redirectUri, params.codeChallenge))
}

export async function POST(request: Request): Promise<Response> {
    const form = await request.formData()
    const params = readParams(form)
    const outcome = await validate(params)
    if (outcome.error) return outcome.error

    const user = await currentUser(request)
    if (!user) return signIn(request, params)

    const expected = consentSignature(request, user.id, params.clientId, params.redirectUri, params.codeChallenge)
    if (String(form.get('consent') ?? '') !== expected) {
        return errorPage('Request expired', 'This approval did not come from the consent screen, or the sign-in changed while it was open. Start the connection again.', 400)
    }

    const target = new URL(params.redirectUri)
    if (params.state) target.searchParams.set('state', params.state)

    if (String(form.get('decision') ?? '') !== 'approve') {
        target.searchParams.set('error', 'access_denied')
        target.searchParams.set('error_description', 'The account holder declined the connection.')
        return Response.redirect(target.toString(), 302)
    }

    const role = getUserRole(user)
    const granted = narrowToGrantable(parseScopeString(params.scope), role)

    const payload = await getPayload({ config })
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

    target.searchParams.set('code', code)
    return Response.redirect(target.toString(), 302)
}
