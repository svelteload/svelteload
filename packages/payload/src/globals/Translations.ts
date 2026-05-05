import type { GlobalConfig } from 'payload'
import { isAdmin } from '@cms/access/roles'

const COMMON_KEYS = [
    'search_open',
    'search_close',
    'search_placeholder',
    'no_search_results',
    'view_all',
    'untitled',
    'all',
    'previous',
    'next',
    'load_more',
    'back_to',
    'contact_us',
    'scroll_top',
    'toggle_menu',
    'language_menu',
    'submenu',
    'no_posts',
    'done',
    'clear',
] as const

type CommonKey = typeof COMMON_KEYS[number]

const commonField = (name: CommonKey, label: string, description?: string) => ({
    name,
    type: 'text' as const,
    label,
    required: true,
    localized: true,
    ...(description ? { admin: { description } } : {}),
})

export const Translations: GlobalConfig = {
    slug: 'translations',
    label: 'Translations',
    admin: {
        group: 'Site Configuration',
        description: 'Shared UI strings reused across the site. Admin-only because removing a key here breaks every component that reads it. The Common section covers strings every site needs; add anything project-specific to Custom.',
        hidden: ({ user }) => !user || (user as { role?: string }).role !== 'admin',
    },
    versions: { drafts: true },
    access: {
        read: () => true,
        update: isAdmin,
    },
    fields: [
        {
            label: 'Common',
            type: 'group',
            name: 'common',
            admin: { description: 'Standard UI strings every site needs. Frontend reads these by name.' },
            fields: [
                commonField('search_open', 'Search Button Label'),
                commonField('search_close', 'Search Close Label'),
                commonField('search_placeholder', 'Search Input Placeholder'),
                commonField('no_search_results', 'No Search Results', 'Followed by the query in quotes, e.g. \'No results for "term"\'.'),
                commonField('view_all', 'View All Link Label'),
                commonField('untitled', 'Untitled Label', 'Shown when a search result has no title.'),
                commonField('all', 'All Filter Label'),
                commonField('previous', 'Previous (pagination)'),
                commonField('next', 'Next (pagination)'),
                commonField('load_more', 'Load More Button'),
                commonField('back_to', 'Back To Prefix', 'Composed with a page name, e.g. "Back to Projects".'),
                commonField('contact_us', 'Contact Us'),
                commonField('scroll_top', 'Scroll To Top'),
                commonField('toggle_menu', 'Toggle Menu'),
                commonField('language_menu', 'Language Menu'),
                commonField('submenu', 'Submenu Suffix', 'Composed after a nav label, e.g. "Services submenu".'),
                commonField('no_posts', 'No Posts Found'),
                commonField('done', 'Done'),
                commonField('clear', 'Clear'),
            ],
        },
        {
            name: 'entries',
            type: 'array',
            label: 'Custom',
            admin: {
                description: 'Project-specific strings. Use snake_case keys. Keys that conflict with the Common section above are rejected on save.',
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
                            validate: (value: unknown) => {
                                if (typeof value !== 'string' || !value.trim()) return true
                                if (COMMON_KEYS.includes(value as CommonKey)) {
                                    return `"${value}" is a reserved Common key. Edit the value in the Common section above instead.`
                                }
                                return true
                            },
                            admin: {
                                width: '40%',
                                description: 'snake_case identifier. Must not match a Common key.',
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
