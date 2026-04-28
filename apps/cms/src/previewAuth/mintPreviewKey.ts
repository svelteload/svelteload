import type { Payload } from 'payload'
import { randomBytes } from 'crypto'

const KEY_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const CLEANUP_GRACE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Returns the active preview token for the given user, minting a new one if
 * the current token is missing, revoked, or close to expiry. Also lazy-cleans
 * this user's expired tokens past the grace window so the collection doesn't
 * grow without bound.
 *
 * Called from livePreview.url in payload.config.ts whenever an editor opens
 * the preview pane. One token per user at a time is the default shape, but
 * nothing stops additional tokens from being created manually in the admin.
 */
export async function mintPreviewKey(payload: Payload, userId: string | number): Promise<string> {
  const now = Date.now()
  const refreshCutoff = new Date(now + REFRESH_WINDOW_MS).toISOString()

  const existing = await payload.find({
    collection: 'preview-keys',
    where: {
      and: [
        { user: { equals: userId } },
        { revoked: { not_equals: true } },
        { expiresAt: { greater_than: refreshCutoff } },
      ],
    },
    sort: '-expiresAt',
    limit: 1,
    overrideAccess: true,
  })

  if (existing.docs[0]) {
    return existing.docs[0].token as string
  }

  const cleanupCutoff = new Date(now - CLEANUP_GRACE_MS).toISOString()
  const stale = await payload.find({
    collection: 'preview-keys',
    where: {
      and: [
        { user: { equals: userId } },
        { expiresAt: { less_than: cleanupCutoff } },
      ],
    },
    limit: 100,
    overrideAccess: true,
  })
  for (const doc of stale.docs) {
    await payload.delete({
      collection: 'preview-keys',
      id: doc.id,
      overrideAccess: true,
    })
  }

  const token = randomBytes(32).toString('base64url')
  const created = await payload.create({
    collection: 'preview-keys',
    data: {
      token,
      user: userId,
      expiresAt: new Date(now + KEY_LIFETIME_MS).toISOString(),
    },
    overrideAccess: true,
  })

  return created.token as string
}
