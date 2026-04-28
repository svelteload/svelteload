import { frontendRoutes } from 'project-meta/frontendRoutes'
import { getPayloadInstance } from './payload'

export type CollectionRoute = {
    collection: string
    matcher: (pathname: string) => Record<string, unknown> | null
}

export async function resolveAdminUrlForPath(
    pathname: string,
    adminBaseUrl: string | undefined,
): Promise<string | null> {
    if (!adminBaseUrl) return null

    const payload = await getPayloadInstance()
    const trimmedAdmin = adminBaseUrl.replace(/\/$/, '')

    for (const route of frontendRoutes) {
        const where = route.matcher(pathname)
        if (!where) continue

        try {
            const result = await payload.find({
                collection: route.collection as any,
                where: where as any,
                draft: true,
                depth: 0,
                limit: 1,
                overrideAccess: true,
            })
            const doc = result.docs[0] as { id?: string | number } | undefined
            if (doc?.id) {
                return `${trimmedAdmin}/admin/collections/${route.collection}/${doc.id}`
            }
        } catch {}
    }

    return null
}

export function buildAdminEditUrl(
    collection: string,
    id: string | number,
    adminBaseUrl: string | undefined,
): string | null {
    if (!adminBaseUrl) return null
    const trimmed = adminBaseUrl.replace(/\/$/, '')
    return `${trimmed}/admin/collections/${collection}/${id}`
}
