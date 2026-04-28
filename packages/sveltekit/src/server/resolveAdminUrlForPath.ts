import { frontendRoutes } from 'payload-config/frontendRoutes'
import { getPayloadInstance } from './payload'

export type CollectionRoute = {
    collection: string
    matcher: (pathname: string) => Record<string, unknown> | null
}

/**
 * Resolves a request path on the public site to the corresponding admin doc
 * URL, e.g. `/services/x` → `<admin>/collections/pages/<id>`. Returns null
 * if no preview-eligible collection has a doc at that path. Used by the
 * gatekeeper "Open CMS" button so it deep-links instead of dropping users
 * at the admin root.
 *
 * The route table is per-project and lives in `payload-config/frontendRoutes`,
 * imported via the workspace package name so this works in every project.
 */
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
        } catch {
            // Try next matcher; missing collection or transient error
            // shouldn't break gatekeeper rendering.
        }
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
