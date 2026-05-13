import { projectMeta } from 'project-meta/projectMeta'
import { getPayloadInstance } from './payload'

const CACHE_TTL_MS = 30 * 1000

type CacheEntry = { expiresAt: number; validUntil: number }
const cache = new Map<string, CacheEntry>()

export async function validatePreviewToken(token: string): Promise<{ valid: true; expiresAt: Date } | { valid: false }> {
  if (!token) return { valid: false }

  const now = Date.now()
  const cached = cache.get(token)
  if (cached && cached.validUntil > now) {
    if (cached.expiresAt > now) {
      return { valid: true, expiresAt: new Date(cached.expiresAt) }
    }
    return { valid: false }
  }

  const payload = await getPayloadInstance()

  let found
  try {
    found = await payload.find({
      collection: 'preview-keys' as any,
      where: {
        token: { equals: token },
      },
      limit: 1,
      overrideAccess: true,
    })
  } catch (err) {
    console.error('[previewAuth] payload.find threw', err)
    return { valid: false }
  }

  const doc = found.docs[0]
  if (!doc) {
    cache.set(token, { expiresAt: 0, validUntil: now + CACHE_TTL_MS })
    return { valid: false }
  }

  const docFields = doc as unknown as { expiresAt: string; revoked?: boolean }
  const expiresAt = new Date(docFields.expiresAt).getTime()
  if (docFields.revoked || expiresAt <= now) {
    cache.set(token, { expiresAt: 0, validUntil: now + CACHE_TTL_MS })
    return { valid: false }
  }

  cache.set(token, { expiresAt, validUntil: now + CACHE_TTL_MS })
  return { valid: true, expiresAt: new Date(expiresAt) }
}

const previewCookiePrefix = (projectMeta as { cookiePrefix?: string }).cookiePrefix
export const PREVIEW_COOKIE_NAME = previewCookiePrefix ? `${previewCookiePrefix}-preview-token` : 'preview-token'
export const PREVIEW_QUERY_PARAM = 'preview_key'
