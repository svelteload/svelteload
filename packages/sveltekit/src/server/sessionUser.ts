import crypto from 'node:crypto'
import { PAYLOAD_SECRET } from '$env/static/private'
import { projectMeta } from 'project-meta/projectMeta'

const prefix = (projectMeta as { cookiePrefix?: string }).cookiePrefix

export const AUTH_COOKIE_NAME = prefix ? `${prefix}-payload-token` : 'payload-token'

export interface SessionUser {
    id: string
    email: string
    collection: string
}

const signingSecret = (): string =>
    crypto.createHash('sha256').update(PAYLOAD_SECRET).digest('hex').slice(0, 32)

const base64UrlDecode = (value: string): string => {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const padding = '='.repeat((4 - (base64.length % 4)) % 4)
    return Buffer.from(base64 + padding, 'base64').toString('utf8')
}

export function verifySessionToken(token: string): SessionUser | null {
    try {
        const parts = token.split('.')
        if (parts.length !== 3) return null

        const [headerB64, payloadB64, signature] = parts
        const expected = crypto
            .createHmac('sha256', signingSecret())
            .update(`${headerB64}.${payloadB64}`)
            .digest('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '')

        if (signature !== expected) return null

        const claims = JSON.parse(base64UrlDecode(payloadB64))
        if (typeof claims.exp === 'number' && claims.exp < Math.floor(Date.now() / 1000)) return null

        return {
            id: String(claims.id),
            email: String(claims.email),
            collection: String(claims.collection),
        }
    } catch (_) {
        return null
    }
}
