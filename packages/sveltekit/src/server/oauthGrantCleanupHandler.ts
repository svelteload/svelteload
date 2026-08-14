import type { RequestHandler } from '@sveltejs/kit'
import { json } from '@sveltejs/kit'
import { CRON_SECRET } from '$env/static/private'
import { getPayloadInstance } from './payload'

export const GET: RequestHandler = async ({ request }) => {
    if (request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
        return json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await getPayloadInstance()
    const now = new Date().toISOString()

    try {
        const result = await payload.delete({
            collection: 'oauth-grants' as any,
            where: {
                or: [
                    { expiresAt: { less_than: now } },
                    { and: [{ type: { equals: 'code' } }, { consumedAt: { exists: true } }] },
                ],
            } as any,
            overrideAccess: true,
        })

        const deleted = Array.isArray((result as { docs?: unknown[] }).docs)
            ? (result as { docs: unknown[] }).docs.length
            : 0

        return json({ ok: true, deleted })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return json({ ok: false, error: message }, { status: 500 })
    }
}
