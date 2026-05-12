import type { Field } from 'payload'
import { minRoleField, getUserRole } from '@cms/access/roles'

const adminField = minRoleField('admin')

export const apiKeyFields: Field[] = [
  {
    name: 'enableAPIKey',
    type: 'checkbox',
    access: {
      read: adminField,
      create: adminField,
      update: adminField,
    },
    admin: {
      condition: (_data, _siblingData, { user }) => getUserRole(user) === 'admin',
    },
  },
  {
    name: 'apiKey',
    type: 'text',
    access: {
      read: adminField,
      create: adminField,
      update: adminField,
    },
    admin: {
      condition: (_data, _siblingData, { user }) => getUserRole(user) === 'admin',
    },
  },
]
