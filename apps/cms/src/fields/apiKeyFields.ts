import type { Field } from 'payload'
import { isAdminFieldAccess, getUserRole } from '@cms/access/roles'

export const apiKeyFields: Field[] = [
  {
    name: 'enableAPIKey',
    type: 'checkbox',
    access: {
      read: isAdminFieldAccess,
      create: isAdminFieldAccess,
      update: isAdminFieldAccess,
    },
    admin: {
      condition: (_data, _siblingData, { user }) => getUserRole(user) === 'admin',
    },
  },
  {
    name: 'apiKey',
    type: 'text',
    access: {
      read: isAdminFieldAccess,
      create: isAdminFieldAccess,
      update: isAdminFieldAccess,
    },
    admin: {
      condition: (_data, _siblingData, { user }) => getUserRole(user) === 'admin',
    },
  },
]
