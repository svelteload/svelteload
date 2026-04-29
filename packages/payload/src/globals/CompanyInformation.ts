import type { GlobalConfig } from 'payload'
import { isAdminOrEditor } from '@cms/access/roles'

export const CompanyInformation: GlobalConfig = {
    slug: 'company-info',
    label: 'Company Information',
    admin: { group: 'Site Configuration' },
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
                                description: 'Canonical brand logo. Used by Schema.org Organization and as a fallback for footer/email logos.',
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
                        {
                            type: 'row',
                            fields: [
                                {
                                    name: 'corporateIdLabel',
                                    type: 'text',
                                    label: 'Corporate ID Label',
                                    localized: true,
                                    admin: {
                                        width: '50%',
                                        description: 'Localized label for the corporate ID, e.g. "Org. nr".',
                                    },
                                },
                                {
                                    name: 'corporateId',
                                    type: 'text',
                                    label: 'Corporate ID',
                                    admin: { width: '50%' },
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
                                description: 'Links to official company profiles. Each row is an icon + URL pair. Used as Schema.org sameAs and (optionally) by the footer or other social UI.',
                                components: {
                                    RowLabel: {
                                        path: '@cms/components/ArrayRowLabel',
                                        clientProps: { fieldName: 'label', fallback: 'Profile' },
                                    },
                                },
                            },
                            fields: [
                                {
                                    name: 'icon',
                                    type: 'upload',
                                    relationTo: 'media',
                                    required: true,
                                    admin: {
                                        description: 'Icon shown wherever this profile is rendered. Upload the exact image you want displayed (typically a small square SVG or PNG).',
                                    },
                                },
                                {
                                    name: 'url',
                                    type: 'text',
                                    required: true,
                                },
                                {
                                    name: 'label',
                                    type: 'text',
                                    localized: true,
                                    admin: {
                                        description: 'Used as the icon\'s alt text and the admin row label. E.g. "LinkedIn", "Facebook".',
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    ],
}
