import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

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

export const verifyPkceChallenge = (verifier: string, challenge: string): boolean => {
    if (!verifier || !challenge) return false
    const computed = toBase64Url(createHash('sha256').update(verifier).digest())
    const a = Buffer.from(computed)
    const b = Buffer.from(challenge)
    return a.length === b.length && timingSafeEqual(a, b)
}
