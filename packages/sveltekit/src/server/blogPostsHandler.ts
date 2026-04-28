import { json } from '@sveltejs/kit'
import type { RequestHandler } from '@sveltejs/kit'
import { getPayloadInstance } from './payload'
import { fetchBlogPosts } from './fetchBlogPosts'

export const GET: RequestHandler = async ({ url, locals }) => {
    const page = parseInt(url.searchParams.get('page') || '1', 10)
    const pageSize = Math.min(
        Math.max(parseInt(url.searchParams.get('limit') || '10', 10), 1),
        50,
    )

    const payload = await getPayloadInstance()
    const { blogPosts, blogPagination } = await fetchBlogPosts({
        payload,
        isDraft: locals.isPreview,
        page,
        pageSize,
    })

    return json({ blogPosts, blogPagination })
}
