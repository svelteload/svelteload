import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { projectMeta } from 'project-meta/projectMeta'

const toBase64Url = (input: Buffer | string): string =>
    Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const fromBase64Url = (input: string): Buffer =>
    Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

const signingSecret = (): string => {
    const value = process.env.PAYLOAD_SECRET
    if (!value) throw new Error('PAYLOAD_SECRET is required to sign MCP access tokens.')
    return value
}

export type AccessTokenClaims = {
    iss: string
    sub: string
    aud: string
    client_id: string
    scope: string
    role: string
    iat: number
    exp: number
}

export const signAccessToken = (
    claims: Omit<AccessTokenClaims, 'iat' | 'exp'>,
    ttlSeconds: number,
): string => {
    const iat = Math.floor(Date.now() / 1000)
    const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'at+jwt' }))
    const body = toBase64Url(JSON.stringify({ ...claims, iat, exp: iat + ttlSeconds }))
    const signature = toBase64Url(createHmac('sha256', signingSecret()).update(`${header}.${body}`).digest())
    return `${header}.${body}.${signature}`
}

export const verifyAccessToken = (token: string): AccessTokenClaims | null => {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [header, body, signature] = parts
    const expected = createHmac('sha256', signingSecret()).update(`${header}.${body}`).digest()
    const provided = fromBase64Url(signature)
    if (provided.length !== expected.length) return null
    if (!timingSafeEqual(provided, expected)) return null

    try {
        const claims = JSON.parse(fromBase64Url(body).toString('utf8')) as AccessTokenClaims
        if (typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000)) return null
        return claims
    } catch (_) {
        return null
    }
}

export const randomSecret = (bytes = 32): string => toBase64Url(randomBytes(bytes))

export const hashSecret = (value: string): string => createHash('sha256').update(value).digest('hex')

const sessionCookie = (request: Request): string => {
    const name = projectMeta.cookiePrefix ? `${projectMeta.cookiePrefix}-payload-token` : 'payload-token'
    const match = (request.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
    return match ? match[1] : ''
}

/**
 * Binds the consent form to the session that was shown it, so approval cannot be driven by a
 * cross-site POST. An attacker cannot read the victim's session cookie, so cannot produce this.
 */
export const consentSignature = (
    request: Request,
    userId: unknown,
    clientId: string,
    redirectUri: string,
    codeChallenge: string,
): string =>
    toBase64Url(
        createHmac('sha256', signingSecret())
            .update([sessionCookie(request), String(userId), clientId, redirectUri, codeChallenge].join('|'))
            .digest(),
    )

export const verifyPkceChallenge = (verifier: string, challenge: string): boolean => {
    if (!verifier || !challenge) return false
    const computed = toBase64Url(createHash('sha256').update(verifier).digest())
    const a = Buffer.from(computed)
    const b = Buffer.from(challenge)
    return a.length === b.length && timingSafeEqual(a, b)
}
