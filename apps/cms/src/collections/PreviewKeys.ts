import type { CollectionConfig } from 'payload'
import { isAdmin } from '@cms/access/roles'

/**
 * Per-user, shareable preview tokens used to gate non-production frontends
 * (e.g. preview.<client>.com) behind Payload admin authorship.
 *
 * Tokens are minted by livePreview.url when an editor opens the preview pane.
 * Each user has at most one active token; the mint helper reuses the current
 * one until it's within the refresh window, then rotates it. Expired keys are
 * lazy-cleaned on mint after a grace period so URLs shared just before
 * expiry still work briefly.
 */
export const PreviewKeys: CollectionConfig = {
  slug: 'preview-keys',
  admin: {
    useAsTitle: 'token',
    group: 'Admin',
    defaultColumns: ['user', 'createdAt', 'expiresAt', 'revoked'],
    description: 'Shareable preview tokens. Each token grants access to preview.<client>.com for its lifetime. Revoking or deleting a token immediately cuts off access.',
  },
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'token',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'expiresAt',
      type: 'date',
      required: true,
    },
    {
      name: 'revoked',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Check to cut off access before the natural expiry. The row\'s updatedAt timestamp records when this was changed.',
      },
    },
  ],
  timestamps: true,
}
