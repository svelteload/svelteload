import type { Payload } from 'payload'

type UrlRedirectsGlobal = {
    redirects?: Array<{ from?: string | null; to?: string | null }> | null
} | null

export async function resolveUrlRedirect(payload: Payload, targetPath: string): Promise<string | null> {
    const global = (await payload.findGlobal({ slug: 'url-redirects' as never, depth: 0 })) as UrlRedirectsGlobal
    const match = global?.redirects?.find((entry) => entry.from === targetPath)
    return match?.to ?? null
}
