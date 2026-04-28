import type { CollectionConfig } from 'payload'
import { isAdminOrEditor } from '@cms/access/roles'
import { generateSlugFromName } from '../utils/generateSlugFromName'
import { cleanLexicalContent, extractPlainTextFromLexical } from '../utils/extractPlainTextFromLexical'

const TITLE_MAX_LENGTH = 100
const DESCRIPTION_MAX_LENGTH = 200
const DESCRIPTION_MIN_CUT_RATIO = 0.6
const TITLE_CUTOFF_SIGNS = /[,.:;!?—–]/
const DESCRIPTION_CUTOFF_SIGNS = /[,.:;!?—–]/g
const FALLBACK_SLUG_PATTERN = /^post-\d+$/

function sliceGraphemes(text: string, max: number): string {
    const codePoints = Array.from(text)
    if (codePoints.length <= max) return text
    return codePoints.slice(0, max).join('')
}

function deriveTitleFromFirstLine(firstLine: string): string {
    const normalized = firstLine.normalize('NFKC').replace(/�/g, '').trim()
    const slice = sliceGraphemes(normalized, TITLE_MAX_LENGTH)
    const signMatch = slice.match(TITLE_CUTOFF_SIGNS)
    if (signMatch && signMatch.index !== undefined && signMatch.index > 0) {
        return slice.slice(0, signMatch.index).trim()
    }
    if (normalized.length <= TITLE_MAX_LENGTH) return normalized
    return slice.trim() + '…'
}

function deriveDescription(plainText: string): string {
    const summary = plainText.replace(/\s+/g, ' ').normalize('NFKC').replace(/�/g, '').trim()
    if (summary.length <= DESCRIPTION_MAX_LENGTH) return summary

    const sliced = sliceGraphemes(summary, DESCRIPTION_MAX_LENGTH)

    let lastPunct = -1
    let match: RegExpExecArray | null
    DESCRIPTION_CUTOFF_SIGNS.lastIndex = 0
    while ((match = DESCRIPTION_CUTOFF_SIGNS.exec(sliced)) !== null) {
        lastPunct = match.index
    }
    const minAcceptable = Math.floor(DESCRIPTION_MAX_LENGTH * DESCRIPTION_MIN_CUT_RATIO)
    if (lastPunct >= minAcceptable) {
        return sliced.slice(0, lastPunct).trim()
    }

    const lastSpace = sliced.lastIndexOf(' ')
    if (lastSpace >= minAcceptable) {
        return sliced.slice(0, lastSpace).trim()
    }

    return sliced.trim()
}

function deriveSlug(title: string, plainText: string): string {
    const fromTitle = generateSlugFromName(title)
    if (fromTitle) return fromTitle
    const fromBody = generateSlugFromName(sliceGraphemes(plainText, TITLE_MAX_LENGTH))
    if (fromBody) return fromBody
    return `post-${Date.now()}`
}

/**
 * Build the BlogPosts collection. Pass the rest of the collections array so
 * BlogPosts can auto-detect whether Tags is registered and conditionally
 * include the tags relationship field. Single toggle: add/remove Tags from
 * the siblings list and BlogPosts adapts.
 */
export function buildBlogPosts(siblings: CollectionConfig[] = []): CollectionConfig {
    const hasTags = siblings.some((c) => c?.slug === 'tags')
    const tagsField = hasTags
        ? [{
            name: 'tags',
            type: 'relationship' as const,
            relationTo: 'tags' as const,
            hasMany: true,
            label: 'Tags',
            admin: {
                position: 'sidebar' as const,
                description: 'Optional. Tag this post for filtering.',
            },
        }]
        : []

    return {
        ..._buildBlogPostsBase(),
        fields: _insertTagsField(_buildBlogPostsBase().fields, tagsField),
    }
}

function _insertTagsField(fields: any[], tagsField: any[]): any[] {
    if (tagsField.length === 0) return fields
    const idx = fields.findIndex((f) => f && f.name === 'metaImage')
    if (idx === -1) return [ ...fields, ...tagsField ]
    return [ ...fields.slice(0, idx + 1), ...tagsField, ...fields.slice(idx + 1) ]
}

function _buildBlogPostsBase(): CollectionConfig {
    return {
    slug: 'blog',
    labels: {
        singular: 'Blog Post',
        plural: 'Blog Posts',
    },
    admin: {
        defaultColumns: [ 'title', 'slug', 'publicationDate', 'updatedAt' ],
        group: 'Content Management',
        useAsTitle: 'title',
    },
    versions: {
        drafts: true,
    },
    access: {
        read: () => true,
        create: isAdminOrEditor,
        update: isAdminOrEditor,
        delete: isAdminOrEditor,
    },
    fields: [
        {
            name: 'content',
            type: 'richText',
            label: 'Post',
            required: true,
            localized: true,
            admin: {
                description: 'Paste your post here. The first line is used as the title and URL.',
            },
        },
        {
            name: 'images',
            type: 'array',
            label: 'Images',
            admin: {
                description: 'Add 1 or more images. The first one is used as the meta image. Portrait and landscape both supported.',
            },
            fields: [
                {
                    name: 'image',
                    type: 'upload',
                    relationTo: 'media',
                    required: true,
                },
            ],
        },
        {
            name: 'publicationDate',
            type: 'date',
            label: 'Publication Date',
            required: true,
            defaultValue: () => new Date().toISOString().split('T')[0],
            admin: {
                position: 'sidebar',
                date: {
                    pickerAppearance: 'default',
                    displayFormat: 'yyyy-MM-dd',
                },
            },
        },
        {
            name: 'title',
            type: 'text',
            label: 'Title',
            localized: true,
            admin: {
                position: 'sidebar',
                description: 'Auto-generated from the first line of your post. Edit to override, or clear to regenerate.',
            },
        },
        {
            name: 'slug',
            type: 'text',
            label: 'Slug',
            localized: true,
            admin: {
                position: 'sidebar',
                description: 'Auto-generated from the title. Edit to customise the URL.',
            },
        },
        {
            name: 'metaDescription',
            type: 'textarea',
            label: 'Meta Description',
            maxLength: 200,
            localized: true,
            admin: {
                position: 'sidebar',
                description: 'Auto-generated from an excerpt of your post. Edit to override, or clear to regenerate.',
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
            localized: true,
            admin: {
                position: 'sidebar',
                description: 'Auto-generated from your first uploaded image. Override to use a different image for social sharing.',
            },
        },
        {
            name: 'pinnedOrder',
            type: 'number',
            label: 'Pin Order',
            admin: {
                position: 'sidebar',
                description: 'Pin this post to the top. Lower numbers appear first (e.g. 1 = top). Leave blank to sort by date.',
            },
        },
        {
            name: 'localizedPaths',
            type: 'json',
            admin: {
                position: 'sidebar',
                readOnly: true,
                description: 'Auto-generated. Used by the search index.',
            },
        },
    ],
    hooks: {
        beforeChange: [
            async ({ data, req, originalDoc }) => {
                if (req.context?.bypassHooks) return data

                const articleId = originalDoc?.id || null

                if (data.content) {
                    cleanLexicalContent(data.content)

                    const plainText = extractPlainTextFromLexical(data.content)
                    const firstLine = plainText
                        .split(/\r?\n/)
                        .map((l: string) => l.trim())
                        .find((l: string) => l.length > 0) || ''

                    const derivedTitle = deriveTitleFromFirstLine(firstLine)

                    if (!data.title) {
                        data.title = derivedTitle
                    } else {
                        data.title = data.title.normalize('NFKC').replace(/�/g, '').trim()
                    }

                    if (!data.metaDescription) {
                        data.metaDescription = deriveDescription(plainText)
                    } else {
                        data.metaDescription = data.metaDescription.normalize('NFKC').replace(/�/g, '')
                    }

                    if (!data.slug || FALLBACK_SLUG_PATTERN.test(data.slug)) {
                        data.slug = deriveSlug(data.title, plainText)
                    }
                }

                const firstImage = Array.isArray(data.images) && data.images[0]?.image
                if (!data.metaImage && firstImage) {
                    data.metaImage = firstImage
                }

                if (data.slug) {
                    const conflictingArticles = await req.payload.find({
                        collection: 'blog' as any,
                        where: {
                            and: [
                                ...(articleId ? [ { id: { not_equals: articleId } } ] : []),
                                { slug: { equals: data.slug } },
                            ],
                        },
                        limit: 1,
                    })

                    if (conflictingArticles.docs.length > 0) {
                        let counter = 2
                        const baseSlug = data.slug
                        while (counter <= 100) {
                            const candidate = `${baseSlug}-${counter}`
                            const testConflict = await req.payload.find({
                                collection: 'blog' as any,
                                where: {
                                    and: [
                                        ...(articleId ? [ { id: { not_equals: articleId } } ] : []),
                                        { slug: { equals: candidate } },
                                    ],
                                },
                                limit: 1,
                            })
                            if (testConflict.docs.length === 0) {
                                data.slug = candidate
                                break
                            }
                            counter++
                        }
                    }
                }

                const rawLocale = req.locale
                const currentLocale = (typeof rawLocale === 'string' && rawLocale && rawLocale !== 'undefined' && rawLocale !== 'null')
                    ? rawLocale
                    : 'en'

                const landing = await req.payload.find({
                    collection: 'pages' as any,
                    where: { pageType: { equals: 'blog' } },
                    depth: 0,
                    limit: 1,
                })
                const landingDoc = landing.docs[0] as any | undefined
                const rawLandingPaths = landingDoc?.localizedPaths
                let landingLocalizedPaths: Record<string, string> = {}
                if (rawLandingPaths && typeof rawLandingPaths === 'object' && Object.keys(rawLandingPaths).length > 0) {
                    landingLocalizedPaths = rawLandingPaths
                } else if (landingDoc?.path) {
                    landingLocalizedPaths = { en: landingDoc.path }
                } else {
                    landingLocalizedPaths = { en: '/blog' }
                }

                const allSlugs: Record<string, string> = {}
                if (articleId) {
                    try {
                        const existing = await req.payload.findByID({
                            collection: 'blog' as any,
                            id: articleId,
                            locale: 'all' as any,
                            depth: 0,
                            draft: true,
                        })
                        const slugField = (existing as any).slug
                        if (typeof slugField === 'object' && slugField !== null) {
                            for (const [ locale, slug ] of Object.entries(slugField as Record<string, string>)) {
                                if (slug) allSlugs[locale] = slug
                            }
                        } else if (typeof slugField === 'string' && slugField) {
                            allSlugs[currentLocale] = slugField
                        }
                    } catch (_) {}
                }
                if (data.slug) {
                    allSlugs[currentLocale] = data.slug
                }

                const localizedPaths: Record<string, string> = {}
                for (const [ locale, prefix ] of Object.entries(landingLocalizedPaths)) {
                    const slugForLocale = allSlugs[locale]
                    if (slugForLocale) {
                        localizedPaths[locale] = `${prefix}/${slugForLocale}`
                    }
                }
                ;(data as any).localizedPaths = localizedPaths

                return data
            },
        ],
    },
}
}

