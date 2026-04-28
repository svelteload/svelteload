import { convertLexicalFieldsToHTML } from '../utils/lexicalConverter'

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
}

export async function fetchBlogPosts({
    payload,
    isDraft,
    page = 1,
    pageSize,
}: FetchBlogPostsArgs): Promise<{ blogPosts: any[]; blogPagination: BlogPagination }> {
    const result = await payload.find({
        collection: 'blog',
        draft: isDraft,
        depth: 2,
        limit: pageSize,
        page,
        sort: [ 'pinnedOrder', '-publicationDate' ],
        where: {
            and: [
                { publicationDate: { less_than_equal: new Date().toISOString() } },
                ...(isDraft ? [] : [ { _status: { equals: 'published' } } ]),
            ],
        },
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
