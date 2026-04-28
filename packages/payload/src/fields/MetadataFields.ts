import type { Field, SelectField } from 'payload'
import { projectMeta } from 'project-meta/projectMeta'

const labelize = (value: string): string =>
    value
        .split('-')
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(' ')

const pageTypeField: SelectField = {
    name: 'pageType',
    type: 'select',
    label: 'Page Type',
    options: projectMeta.pageTypes.map((value) => ({ value, label: labelize(value) })),
    admin: {
        position: 'sidebar',
        description: 'Marks this page for a special role (e.g. search, blog landing). Optional. Each value can only be used once per collection.',
    },
    validate: async (value, args) => {
        if (!value) return true
        const a = args as any
        const collectionSlug: string | undefined = a?.req?.collection?.config?.slug
        if (!collectionSlug) return true
        const existing = await a.req.payload.find({
            collection: collectionSlug,
            where: {
                and: [
                    ...(a.id ? [{ id: { not_equals: a.id } }] : []),
                    { pageType: { equals: value } },
                ],
            },
            limit: 1,
            depth: 0,
        })
        if (existing.docs.length > 0) {
            return `Page type "${value}" is already in use by another ${collectionSlug} document.`
        }
        return true
    },
}

export const metadataFields: Field[] = [
    {
        name: 'name',
        type: 'text',
        label: 'Name',
        required: true,
        localized: true,
        admin: {
            position: 'sidebar',
            description: 'Short name for admin display',
        },
    },
    {
        name: 'metaTitle',
        type: 'text',
        label: 'Page Title',
        required: true,
        localized: true,
        admin: {
            position: 'sidebar',
            description: 'Title that appears in browser tabs and search results',
        },
    },
    {
        name: 'metaDescription',
        type: 'textarea',
        label: 'Meta Description',
        required: true,
        localized: true,
        maxLength: 200,
        admin: {
            position: 'sidebar',
            components: {
                Field: '@cms/components/TextareaWithCounter',
            },
        },
    },
    {
        name: 'metaImage',
        type: 'upload',
        relationTo: 'media',
        label: 'Meta Image',
        admin: {
            position: 'sidebar',
        },
    },
    pageTypeField,
    {
        name: 'localizedPaths',
        type: 'json',
        label: 'Localized Paths',
        admin: {
            position: 'sidebar',
            readOnly: true,
            description: 'Auto-generated localized paths for each language',
        },
    },
]
