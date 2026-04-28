import { json } from '@sveltejs/kit'
import type { RequestHandler } from '@sveltejs/kit'
import { runSearch } from '@cms/plugins/searchPlugin/runSearch'
import { getPayloadInstance } from './payload'

export const GET: RequestHandler = async ({ url }) => {
    const q = url.searchParams.get('q') ?? ''
    const locale = url.searchParams.get('locale') || 'en'
    const type = url.searchParams.get('type') ?? undefined
    const limitParam = url.searchParams.get('limit')
    const offsetParam = url.searchParams.get('offset')

    const limit = Math.min(Math.max(parseInt(limitParam ?? '20', 10) || 20, 1), 50)
    const offset = Math.max(parseInt(offsetParam ?? '0', 10) || 0, 0)

    const payload = await getPayloadInstance()
    const response = await runSearch(payload, { query: q, locale, type, limit, offset })
    return json(response)
}
