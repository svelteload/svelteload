import type { CollectionConfig } from 'payload'
import { setAccess } from '@cms/access/roles'
import { projectMeta } from 'project-meta/projectMeta'
import { BASE_IMAGE_SIZES } from '../imageSizes'
import { sanitizeUploadFilename } from '../utils/sanitizeUploadFilename'

export const Media: CollectionConfig = {
    slug: 'media',
    hooks: {
        beforeOperation: [
            ({ req, operation }) => {
                if ((operation === 'create' || operation === 'update') && req.file?.name) {
                    req.file.name = sanitizeUploadFilename(req.file.name)
                }
            },
        ],
        afterRead: [
            ({ doc }) => {
                const base = projectMeta.mediaUrlBase.replace(/\/$/, '')
                if (doc.filename) {
                    doc.url = `${base}/${doc.filename}`
                }
                if (doc.sizes) {
                    for (const size of Object.values(doc.sizes as Record<string, any>)) {
                        if (size?.filename) {
                            size.url = `${base}/${size.filename}`
                        }
                    }
                }
                return doc
            },
        ],
    },
    admin: {
        group: 'Content Management',
        defaultColumns: ['filename', 'alt', 'usageCount', 'updatedAt'],
        pagination: {
            defaultLimit: 100,
        },
        components: {
            views: {
                list: {
                    actions: ['@cms/components/ScanMediaUsageButton'],
                },
            },
        },
    },
    access: setAccess('editor'),
    fields: [
        {
            name: 'alt',
            type: 'text',
            localized: true,
        },
        {
            name: 'usageCount',
            type: 'number',
            label: 'Usage Count',
            admin: {
                position: 'sidebar',
                readOnly: true,
                description: 'Number of times this file is referenced. Click "Scan Usage" to update.',
            },
        },
        {
            name: 'usedIn',
            type: 'array',
            label: 'Used In',
            admin: {
                readOnly: true,
                description: 'Documents referencing this file. Click "Scan Usage" to update.',
                components: {
                    RowLabel: {
                        path: '@cms/components/ArrayRowLabel',
                        clientProps: {
                            fieldName: 'docTitle',
                            fallback: 'Reference',
                        },
                    },
                },
            },
            fields: [
                { name: 'collection', type: 'text', label: 'Collection', admin: { readOnly: true } },
                { name: 'docTitle', type: 'text', label: 'Document', admin: { readOnly: true } },
                { name: 'count', type: 'number', label: 'Times Used', admin: { readOnly: true } },
                { name: 'path', type: 'text', label: 'Path', admin: { readOnly: true } },
                { name: 'docId', type: 'number', label: 'Document ID', admin: { readOnly: true } },
            ],
        },
    ],
    upload: {
        mimeTypes: [
            'image/*',
            'video/mp4',
            'video/webm',
            'video/ogg',
            'video/avi',
            'video/mov',
            'video/quicktime',
            'audio/mpeg',
            'audio/mp3',
            'audio/wav',
            'audio/ogg',
            'audio/aac',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/rtf',
            'text/plain',
            'text/markdown',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/zip',
            'application/x-rar-compressed',
            'application/x-7z-compressed',
            'application/gzip',
            'application/json',
            'application/xml',
            'text/xml',
            'application/javascript',
            'text/css',
            'text/html',
        ],
        imageSizes: [
            ...BASE_IMAGE_SIZES,
            ...projectMeta.additionalImageSizes,
        ],
        adminThumbnail: 'thumbnail',
    },
}
