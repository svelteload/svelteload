import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const toBase64Url = (input: Buffer | string): string =>
    Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const fromBase64Url = (input: string): Buffer =>
    Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

const signingSecret = (secret?: string): string => {
    const value = secret ?? process.env.PAYLOAD_SECRET
    if (!value) throw new Error('PAYLOAD_SECRET is required to sign action links.')
    return value
}

export type ActionClaims = {
    act: 'upload' | 'delete'
    collection?: string
    docId?: string
    sub: string
    jti: string
    iat: number
    exp: number
}

export const signActionToken = (
    claims: Omit<ActionClaims, 'iat' | 'exp' | 'jti'>,
    ttlSeconds: number,
    secret?: string,
): string => {
    const iat = Math.floor(Date.now() / 1000)
    const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'action+jwt' }))
    const body = toBase64Url(
        JSON.stringify({ ...claims, jti: toBase64Url(randomBytes(9)), iat, exp: iat + ttlSeconds }),
    )
    const signature = toBase64Url(createHmac('sha256', signingSecret(secret)).update(`${header}.${body}`).digest())
    return `${header}.${body}.${signature}`
}

export const verifyActionToken = (token: string, secret?: string): ActionClaims | null => {
    if (!token) return null
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [header, body, signature] = parts
    let expected: Buffer
    try {
        expected = createHmac('sha256', signingSecret(secret)).update(`${header}.${body}`).digest()
    } catch (_) {
        return null
    }

    const provided = fromBase64Url(signature)
    if (provided.length !== expected.length) return null
    if (!timingSafeEqual(provided, expected)) return null

    try {
        const claims = JSON.parse(fromBase64Url(body).toString('utf8')) as ActionClaims
        if (typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000)) return null
        if (claims.act !== 'upload' && claims.act !== 'delete') return null
        return claims
    } catch (_) {
        return null
    }
}

export const ACTION_TOKEN_TTL_SECONDS = 30 * 60
