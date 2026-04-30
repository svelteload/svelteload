import type { GlobalConfig } from 'payload'
import { isAdminOrEditor } from '@cms/access/roles'

export const UrlRedirects: GlobalConfig = {
    slug: 'url-redirects',
    label: 'URL Redirects',
    admin: { group: 'Navigation' },
    access: {
        read: () => true,
        update: isAdminOrEditor,
    },
    fields: [
        {
            name: 'redirects',
            type: 'array',
            label: 'Permanent Redirects (301)',
            admin: {
                components: {
                    RowLabel: {
                        path: '@cms/components/RedirectRowLabel',
                    },
                },
            },
            fields: [
                {
                    name: 'from',
                    type: 'text',
                    label: 'From Path',
                    admin: {
                        description: 'Old path without language prefix (e.g. /old-path).',
                    },
                },
                {
                    name: 'to',
                    type: 'text',
                    label: 'To Path',
                    admin: {
                        description: 'New path without language prefix (e.g. /new-path), or an absolute URL for off-site redirects.',
                    },
                },
            ],
        },
    ],
}
