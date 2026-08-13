import type { CollectionConfig } from 'payload'
import { setAccess } from '@cms/access/roles'
import { UPLOAD_MIME_TYPES } from '../uploadMimeTypes'
import { sanitizeUploadFilename } from '../utils/sanitizeUploadFilename'

export const PrivateMedia: CollectionConfig = {
    slug: 'private-media',
    labels: {
        singular: 'Private File',
        plural: 'Private Media',
    },
    hooks: {
        beforeOperation: [
            ({ req, operation }) => {
                if ((operation === 'create' || operation === 'update') && req.file?.name) {
                    req.file.name = sanitizeUploadFilename(req.file.name)
                }
            },
        ],
    },
    admin: {
        group: 'Content Management',
        defaultColumns: ['filename', 'description', 'updatedAt'],
        description:
            'Files that are never served on the website. Reachable only by signed-in CMS users.',
        pagination: {
            defaultLimit: 100,
        },
    },
    access: setAccess('internal'),
    fields: [
        {
            name: 'description',
            type: 'text',
        },
    ],
    upload: {
        mimeTypes: UPLOAD_MIME_TYPES,
    },
}
