import type { GlobalConfig } from 'payload'
import { isAdminOrEditor } from '@cms/access/roles'

export const Translations: GlobalConfig = {
    slug: 'translations',
    label: 'Translations',
    admin: {
        group: 'Site Configuration',
        description: 'Shared UI strings used in multiple places across the site (small action labels, link text, etc.). Anything specific to one block or page belongs on that block instead.',
    },
    versions: { drafts: true },
    access: {
        read: () => true,
        update: isAdminOrEditor,
    },
    fields: [
        {
            type: 'tabs',
            tabs: [
                {
                    label: 'Actions',
                    description: 'Short action labels reused across forms, dialogs, and similar UI.',
                    fields: [
                        {
                            type: 'row',
                            fields: [
                                {
                                    name: 'clear',
                                    type: 'text',
                                    defaultValue: 'Clear',
                                    localized: true,
                                    admin: { width: '50%' },
                                },
                                {
                                    name: 'done',
                                    type: 'text',
                                    defaultValue: 'Done',
                                    localized: true,
                                    admin: { width: '50%' },
                                },
                            ],
                        },
                        {
                            type: 'row',
                            fields: [
                                {
                                    name: 'cancel',
                                    type: 'text',
                                    defaultValue: 'Cancel',
                                    localized: true,
                                    admin: { width: '50%' },
                                },
                                {
                                    name: 'submit',
                                    type: 'text',
                                    defaultValue: 'Submit',
                                    localized: true,
                                    admin: { width: '50%' },
                                },
                            ],
                        },
                        {
                            name: 'search',
                            type: 'text',
                            defaultValue: 'Search',
                            localized: true,
                        },
                    ],
                },
                {
                    label: 'Common',
                    description: 'Common link and inline strings reused across pages.',
                    fields: [
                        {
                            type: 'row',
                            fields: [
                                {
                                    name: 'readMore',
                                    type: 'text',
                                    defaultValue: 'Read more',
                                    localized: true,
                                    admin: { width: '50%' },
                                },
                                {
                                    name: 'learnMore',
                                    type: 'text',
                                    defaultValue: 'Learn more',
                                    localized: true,
                                    admin: { width: '50%' },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    ],
}
