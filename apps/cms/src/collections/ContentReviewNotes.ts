import type { CollectionConfig } from 'payload'
import { setAccess } from '@cms/access/roles'

export const ContentReviewNotes: CollectionConfig = {
  slug: 'content-review-notes',
  admin: {
    hidden: true,
  },
  access: setAccess('agent'),
  fields: [
    {
      name: 'key',
      type: 'text',
      label: 'Document Key',
      required: true,
      unique: true,
    },
    {
      name: 'docUpdatedAt',
      type: 'date',
      label: 'Doc Updated At (at review time)',
      required: false,
      admin: {
        description: 'The updatedAt timestamp of the document when it was last reviewed. Null for globals without versioning.',
      },
    },
  ],
}
