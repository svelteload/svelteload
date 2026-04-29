import type { Field } from 'payload'
import { isAdminFieldAccess } from '@cms/access/roles'

export const roleField: Field = {
  name: 'role',
  type: 'select',
  required: true,
  defaultValue: 'editor',
  options: [
    { label: 'Admin', value: 'admin' },
    { label: 'Editor', value: 'editor' },
    { label: 'Contributor', value: 'contributor' },
  ],
  access: {
    create: isAdminFieldAccess,
    update: isAdminFieldAccess,
  },
  admin: {
    position: 'sidebar',
    description:
      'Admin: full access. Editor: content only, can publish. Contributor: content only, drafts only (cannot publish).',
  },
}
