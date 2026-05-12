import type { Field } from 'payload'
import { minRoleField } from '@cms/access/roles'

export const roleField: Field = {
  name: 'role',
  type: 'select',
  required: true,
  defaultValue: 'editor',
  options: [
    { label: 'Admin', value: 'admin' },
    { label: 'Agent', value: 'agent' },
    { label: 'Editor', value: 'editor' },
    { label: 'Contributor', value: 'contributor' },
    { label: 'Reader', value: 'reader' },
  ],
  access: {
    create: minRoleField('admin'),
    update: minRoleField('admin'),
  },
  admin: {
    position: 'sidebar',
    description:
      'Admin: full access. Agent: reads everything an admin can but only saves drafts (intended for the MCP API key user). Editor: content, can publish. Contributor: content, drafts only. Reader: read-only on content, no writes anywhere.',
  },
}
