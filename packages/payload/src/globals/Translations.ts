import type { GlobalConfig } from 'payload'
import { isAdminOrEditor } from '@cms/access/roles'

export const Translations: GlobalConfig = {
    slug: 'translations',
    label: 'Translations',
    admin: {
        group: 'Site Configuration',
        description: 'Shared UI strings reused across the site. Add a row per string with a stable key (snake_case, not localized) and a localized value. Looked up by key from the frontend.',
    },
    versions: { drafts: true },
    access: {
        read: () => true,
        update: isAdminOrEditor,
    },
    fields: [
        {
            name: 'entries',
            type: 'array',
            label: 'Translations',
            admin: {
                components: {
                    RowLabel: {
                        path: '@cms/components/ArrayRowLabel',
                        clientProps: { fieldName: 'key', fallback: 'Translation' },
                    },
                },
            },
            fields: [
                {
                    type: 'row',
                    fields: [
                        {
                            name: 'key',
                            type: 'text',
                            required: true,
                            admin: {
                                width: '40%',
                                description: 'Stable identifier referenced from the frontend, e.g. "contact_us", "done". Use snake_case.',
                            },
                        },
                        {
                            name: 'value',
                            type: 'text',
                            required: true,
                            localized: true,
                            admin: { width: '60%' },
                        },
                    ],
                },
            ],
        },
    ],
}
