import type { CollectionConfig, GlobalConfig } from 'payload'
import { isAdminOrEditor } from '@cms/access/roles'

export function buildBlogSettings(siblings: CollectionConfig[] = []): GlobalConfig {
    const hasTags = siblings.some((c) => c?.slug === 'tags')

    const tagsHeadingField = hasTags
        ? [{
            name: 'tagsHeading',
            type: 'text' as const,
            label: 'Tags Section Heading',
            required: true,
            localized: true,
            defaultValue: 'Tags',
        }]
        : []

    return {
        slug: 'blog-settings',
        label: 'Blog Settings',
        admin: {
            group: 'Content Management',
            custom: { requiresPageType: 'blog' },
        },
        versions: { drafts: true },
        access: {
            read: () => true,
            update: isAdminOrEditor,
        },
        fields: [
            {
                label: 'Post Page Headings',
                type: 'group',
                name: 'postPageHeadings',
                fields: [
                    {
                        name: 'morePostsHeading',
                        type: 'text',
                        label: 'More Posts Section Heading',
                        required: true,
                        localized: true,
                        defaultValue: 'More Posts',
                    },
                    {
                        name: 'publicationDateHeading',
                        type: 'text',
                        label: 'Publication Date Label',
                        required: true,
                        localized: true,
                        defaultValue: 'Published',
                    },
                    {
                        name: 'shareHeading',
                        type: 'text',
                        label: 'Share Section Heading',
                        required: true,
                        localized: true,
                        defaultValue: 'Share Article',
                    },
                    ...tagsHeadingField,
                    {
                        name: 'backText',
                        type: 'text',
                        label: 'Back Button Text',
                        required: true,
                        localized: true,
                        defaultValue: 'Back to Blog',
                    },
                ],
            },
            {
                label: 'Share Buttons',
                type: 'group',
                name: 'shareSettings',
                fields: [
                    {
                        name: 'shareButtons',
                        type: 'array',
                        label: 'Social Share Buttons',
                        minRows: 1,
                        admin: {
                            description: 'Configure social media sharing buttons. Use {url} and {title} placeholders in URLs.',
                        },
                        fields: [
                            {
                                name: 'media',
                                type: 'upload',
                                relationTo: 'media',
                                label: 'Platform Icon',
                                required: true,
                            },
                            {
                                name: 'url',
                                type: 'text',
                                label: 'Share URL Template',
                                required: true,
                                admin: {
                                    description: 'URL template with {url} and {title} placeholders. Example: https://www.linkedin.com/shareArticle?mini=true&url={url}&title={title}',
                                },
                            },
                        ],
                    },
                ],
            },
        ],
    }
}
