import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminOrSelf } from '@cms/access/roles'
import { roleField } from '@cms/fields/roleField'
import { apiKeyFields } from '@cms/fields/apiKeyFields'
import { forgotPasswordEmail } from '@cms/email/forgotPasswordEmail'
import { projectMeta } from 'project-meta/projectMeta'

const adminUrl = process.env.PUBLIC_PAYLOAD_ADMIN_URL || 'http://localhost:3000'
const frontendUrl = process.env.PUBLIC_SITE_URL || 'http://localhost:5173'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    group: 'Admin',
    defaultColumns: ['email', 'name', 'role', 'updatedAt'],
    hidden: ({ user }) => !user,
    components: {
      views: {
        list: {
          actions: ['@cms/invites/InviteUserButton'],
        },
      },
    },
  },
  access: {
    read: isAdminOrSelf,
    create: isAdmin,
    update: isAdminOrSelf,
    delete: isAdmin,
  },
  auth: {
    useAPIKey: true,
    tokenExpiration: 7 * 24 * 60 * 60,
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
    forgotPassword: {
      expiration: 7 * 24 * 60 * 60 * 1000,
      ...forgotPasswordEmail({
        projectName: projectMeta.projectName,
        fullProjectName: projectMeta.fullProjectName,
        adminUrl,
        siteUrl: frontendUrl,
      }),
    },
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'Name',
    },
    roleField,
    ...apiKeyFields,
  ],
}
