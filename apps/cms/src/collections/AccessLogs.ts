import type { CollectionConfig } from 'payload'
import { isAdmin } from '@cms/access/roles'

/**
 * Append-only log of CMS authentication events (login + logout).
 *
 * Rows are written by the previewAuthPlugin's afterLogin / afterLogout hooks
 * on the auth collection. Admin-read-only; nothing else should create,
 * update or delete rows. Useful for "who's been active" reviews without
 * needing session infrastructure.
 */
export const AccessLogs: CollectionConfig = {
  slug: 'access-logs',
  admin: {
    useAsTitle: 'eventType',
    group: 'Admin',
    defaultColumns: ['user', 'eventType', 'createdAt', 'ip'],
    description: 'CMS login and logout history. Read-only; rows are written automatically.',
  },
  access: {
    read: isAdmin,
    create: () => false,
    update: () => false,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'eventType',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Login', value: 'login' },
        { label: 'Logout', value: 'logout' },
      ],
    },
    {
      name: 'ip',
      type: 'text',
    },
    {
      name: 'userAgent',
      type: 'text',
    },
  ],
  timestamps: true,
}
