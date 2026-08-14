import type { GlobalConfig } from 'payload'
import { setGlobalAccess } from '@cms/access/roles'

export const PendingRedirects: GlobalConfig = {
    slug: 'pending-redirects',
    label: 'Pending Redirects',
    admin: { group: 'Navigation' },
    access: setGlobalAccess('admin'),
    fields: [
        {
            name: 'pending',
            type: 'array',
            label: 'Staged Redirects',
            admin: {
                readOnly: true,
                description: 'Written when a draft changes a live URL, moved into URL Redirects when that document is published. Publishing one document promotes only its own rows.',
            },
            fields: [
                {
                    name: 'collectionSlug',
                    type: 'text',
                },
                {
                    name: 'docId',
                    type: 'text',
                },
                {
                    name: 'locale',
                    type: 'text',
                },
                {
                    name: 'from',
                    type: 'text',
                    admin: {
                        description: 'The URL that is live right now. Frozen on first divergence so repeated draft renames never redirect through a path that was never published.',
                    },
                },
                {
                    name: 'to',
                    type: 'text',
                },
            ],
        },
    ],
}
