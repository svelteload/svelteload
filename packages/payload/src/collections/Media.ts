import type { CollectionConfig } from 'payload'
import { minRoleField, setAccess } from '@cms/access/roles'
import { projectMeta } from 'project-meta/projectMeta'
import { BASE_IMAGE_SIZES, MAX_UPLOAD_DIMENSION } from '../imageSizes'
import { UPLOAD_MIME_TYPES } from '../uploadMimeTypes'
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
            ({ doc, req }) => {
                if (!req.user) {
                    delete doc.sourceUrl
                    delete doc.licenseDocument
                }
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
            type: 'collapsible',
            label: 'Stock Image',
            admin: { initCollapsed: true },
            fields: [
                {
                    name: 'sourceUrl',
                    type: 'text',
                    label: 'Source URL',
                    admin: {
                        description: 'Provider page the file was downloaded from, for redownloading in another size.',
                    },
                    access: { read: minRoleField('reader') },
                },
                {
                    name: 'licenseDocument',
                    type: 'upload',
                    label: 'License Document',
                    relationTo: 'private-media',
                    access: { read: minRoleField('reader') },
                },
            ],
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
        mimeTypes: UPLOAD_MIME_TYPES,
        resizeOptions: {
            width: MAX_UPLOAD_DIMENSION,
            height: MAX_UPLOAD_DIMENSION,
            fit: 'inside',
            withoutEnlargement: true,
        },
        imageSizes: [
            ...BASE_IMAGE_SIZES,
            ...projectMeta.additionalImageSizes,
        ],
        adminThumbnail: 'thumbnail',
    },
}
