import type { GlobalConfig } from 'payload'
import { setGlobalAccess } from '@cms/access/roles'

export const CompanyInformation: GlobalConfig = {
    slug: 'company-info',
    label: 'Company Information',
    admin: { group: 'Site Configuration' },
    versions: { drafts: true },
    access: setGlobalAccess('editor'),
    fields: [
        {
            type: 'tabs',
            tabs: [
                {
                    label: 'Identity',
                    fields: [
                        {
                            type: 'row',
                            fields: [
                                {
                                    name: 'brandName',
                                    type: 'text',
                                    admin: {
                                        width: '50%',
                                        description: 'The name customers know you by. Used as Schema.org name. If left blank, no Schema.org Organization data is emitted.',
                                    },
                                },
                                {
                                    name: 'legalName',
                                    type: 'text',
                                    admin: {
                                        width: '50%',
                                        description: 'Registered company name (e.g. with Inc, AB, Ltd suffix). Used as Schema.org legalName. Leave blank if there is no registered legal entity.',
                                    },
                                },
                            ],
                        },
                        {
                            name: 'alternateNames',
                            type: 'array',
                            label: 'Alternate Names',
                            admin: {
                                description: 'Other names the company is known by, including abbreviations, trade names, regional spellings, and common variants. Used as Schema.org alternateName.',
                                components: {
                                    RowLabel: {
                                        path: '@cms/components/ArrayRowLabel',
                                        clientProps: { fieldName: 'name', fallback: 'Name' },
                                    },
                                },
                            },
                            fields: [
                                { name: 'name', type: 'text', required: true },
                            ],
                        },
                        {
                            name: 'description',
                            type: 'textarea',
                            localized: true,
                            admin: {
                                description: 'Short company description. Used in structured data and as a meta-description fallback.',
                            },
                        },
                        {
                            name: 'logo',
                            type: 'upload',
                            relationTo: 'media',
                            admin: {
                                description: 'Square brand icon (not the wide wordmark). Used by Schema.org Organization in search-engine knowledge panels and rich results. Recommended: 512x512 PNG with a transparent background. Minimum 112x112.',
                            },
                        },
                    ],
                },
                {
                    label: 'Contact',
                    fields: [
                        {
                            type: 'row',
                            fields: [
                                {
                                    name: 'email',
                                    type: 'email',
                                    admin: { width: '50%' },
                                },
                                {
                                    name: 'phoneNumber',
                                    type: 'text',
                                    admin: { width: '50%' },
                                },
                            ],
                        },
                        {
                            name: 'address',
                            type: 'group',
                            fields: [
                                {
                                    name: 'streetAddress',
                                    type: 'text',
                                },
                                {
                                    type: 'row',
                                    fields: [
                                        {
                                            name: 'postalCode',
                                            type: 'text',
                                            admin: { width: '30%' },
                                        },
                                        {
                                            name: 'city',
                                            type: 'text',
                                            localized: true,
                                            admin: {
                                                width: '70%',
                                                description: 'Localize when the city has an established English exonym (e.g. Göteborg → Gothenburg, München → Munich). Leave the native spelling otherwise.',
                                            },
                                        },
                                    ],
                                },
                                {
                                    name: 'country',
                                    type: 'text',
                                    localized: true,
                                },
                            ],
                        },
                    ],
                },
                {
                    label: 'Social',
                    fields: [
                        {
                            name: 'socialLinks',
                            type: 'array',
                            label: 'Social Profiles',
                            admin: {
                                description: 'Used as Schema.org sameAs.',
                                components: {
                                    RowLabel: {
                                        path: '@cms/components/ArrayRowLabel',
                                        clientProps: { fieldName: 'url', fallback: 'Profile' },
                                    },
                                },
                            },
                            fields: [
                                {
                                    name: 'icon',
                                    type: 'upload',
                                    relationTo: 'media',
                                    required: true,
                                },
                                {
                                    name: 'url',
                                    type: 'text',
                                    required: true,
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    ],
}
