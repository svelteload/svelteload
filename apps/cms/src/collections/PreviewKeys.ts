import type { CollectionConfig } from 'payload'
import { setAccess } from '@cms/access/roles'

export const PreviewKeys: CollectionConfig = {
  slug: 'preview-keys',
  admin: {
    useAsTitle: 'token',
    group: 'Admin',
    defaultColumns: ['user', 'createdAt', 'expiresAt', 'revoked'],
    description: 'Shareable preview tokens. Each token grants access to preview.<client>.com for its lifetime. Revoking or deleting a token immediately cuts off access.',
  },
  access: setAccess('agent'),
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
