import type { CollectionConfig } from 'payload'
import { setAccess } from '@cms/access/roles'
import { generateSlugFromName } from '../utils/generateSlugFromName'

export const Tags: CollectionConfig = {
    slug: 'tags',
    labels: {
        singular: 'Tag',
        plural: 'Tags',
    },
    admin: {
        useAsTitle: 'name',
        group: 'Configuration',
        defaultColumns: [ 'name', 'slug' ],
    },
    access: setAccess('editor'),
    fields: [
        {
            name: 'name',
            type: 'text',
            label: 'Tag Name',
            required: true,
            localized: true,
        },
        {
            name: 'slug',
            type: 'text',
            label: 'Slug',
            required: true,
            unique: true,
            admin: {
                position: 'sidebar',
                description: 'URL-safe identifier, auto-generated from the name. Used for filtering.',
            },
        },
    ],
    hooks: {
        beforeChange: [
            async ({ data }) => {
                if (!data.slug && data.name) {
                    data.slug = generateSlugFromName(data.name)
                }
                return data
            },
        ],
    },
}
