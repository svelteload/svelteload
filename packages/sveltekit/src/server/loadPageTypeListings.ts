import type { Payload } from 'payload'
import { fetchBlogPosts } from './fetchBlogPosts'

export type PageTypeListings = {
    blogPosts?: any[]
    blogPagination?: { page: number; pageSize: number; pageCount: number; total: number }
    searchCollections?: Array<{ slug: string; label: string }>
}

const DEFAULT_SEARCH_EXCLUDED = [
    'users',
    'media',
    'private-media',
    'payload-preferences',
    'payload-migrations',
    'content-review-notes',
    'messages',
    'preview-keys',
    'access-logs',
]

export async function loadPageTypeListings({
    payload,
    pageType,
    locale,
    isDraft = false,
    pageSize = 10,
    searchExcludedCollections,
    collectionsForSearch,
}: {
    payload: Payload
    pageType: string | undefined
    locale?: string
    isDraft?: boolean
    pageSize?: number
    searchExcludedCollections?: string[]
    collectionsForSearch?: Array<{ slug: string; label: string }>
}): Promise<PageTypeListings> {
    if (!pageType) return {}

    if (pageType === 'search') {
        const excluded = new Set(searchExcludedCollections ?? DEFAULT_SEARCH_EXCLUDED)
        const collections = (collectionsForSearch ?? []).filter((c) => !excluded.has(c.slug))
        return { searchCollections: collections }
    }

    if (pageType === 'blog') {
        return await fetchBlogPosts({ payload, isDraft, pageSize, locale })
    }

    return {}
}
