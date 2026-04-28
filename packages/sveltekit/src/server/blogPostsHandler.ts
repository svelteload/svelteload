import { json } from '@sveltejs/kit'
import type { RequestHandler } from '@sveltejs/kit'
import { getPayloadInstance } from './payload'
import { convertLexicalFieldsToHTML } from '../utils/lexicalConverter'

export const GET: RequestHandler = async ({ url, locals }) => {
    const page = parseInt(url.searchParams.get('page') || '1', 10)
    const pageSize = Math.min(
        Math.max(parseInt(url.searchParams.get('limit') || '10', 10), 1),
        50,
    )

    const payload = await getPayloadInstance()
    const isDraft = locals.isPreview

    const result = await payload.find({
        collection: 'blog',
        draft: isDraft,
        depth: 2,
        limit: pageSize,
        page,
        sort: '-publicationDate',
        where: {
            and: [
                { publicationDate: { less_than_equal: new Date().toISOString() } },
                ...(isDraft ? [] : [{ _status: { equals: 'published' } }]),
            ],
        },
    })

    const docs = await convertLexicalFieldsToHTML(result.docs)

    return json({
        blogPosts: docs,
        blogPagination: {
            page: result.page,
            pageSize,
            pageCount: Math.ceil(result.totalDocs / pageSize),
            total: result.totalDocs,
        },
    })
}
