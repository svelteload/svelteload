import { projectMeta } from 'project-meta/projectMeta'
import { getPayloadInstance } from './payload'
import { resolveUrlToDoc } from './routableUrls'

export async function resolveAdminUrlForPath(
    pathname: string,
    adminBaseUrl: string | undefined,
): Promise<string | null> {
    if (!adminBaseUrl) return null

    const payload = await getPayloadInstance()
    const trimmedAdmin = adminBaseUrl.replace(/\/$/, '')

    try {
        const hit = await resolveUrlToDoc(payload, projectMeta, pathname)
        if (!hit) return null
        return `${trimmedAdmin}/admin/collections/${hit.collection}/${hit.id}`
    } catch {
        return null
    }
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
