import { convertLexicalFieldsToHTML } from '../utils/lexicalConverter'
import { publishedWhere } from './publishedWhere'

export interface BlogPagination {
    page: number
    pageSize: number
    pageCount: number
    total: number
}

export interface FetchBlogPostsArgs {
    payload: any
    isDraft: boolean
    page?: number
    pageSize: number
    locale?: string
}

export async function fetchBlogPosts({
    payload,
    isDraft,
    page = 1,
    pageSize,
    locale,
}: FetchBlogPostsArgs): Promise<{ blogPosts: any[]; blogPagination: BlogPagination }> {
    const result = await payload.find({
        collection: 'blog',
        ...(locale ? { locale } : {}),
        draft: isDraft,
        depth: 2,
        limit: pageSize,
        page,
        sort: [ 'pinnedOrder', '-publicationDate' ],
        where: publishedWhere(isDraft, 'publicationDate'),
    })

    const blogPosts = await convertLexicalFieldsToHTML(result.docs) as any[]

    return {
        blogPosts,
        blogPagination: {
            page: result.page ?? page,
            pageSize,
            pageCount: Math.ceil(result.totalDocs / pageSize),
            total: result.totalDocs,
        },
    }
}
