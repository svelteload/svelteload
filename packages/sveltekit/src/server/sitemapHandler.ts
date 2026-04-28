import type { RequestHandler } from '@sveltejs/kit'
import { PUBLIC_SITE_URL } from '$env/static/public'
import { projectMeta } from 'project-meta/projectMeta'
import { getPayloadInstance } from './payload'
import { enumerateRoutableDocs, getLocalizationConfig } from './routableUrls'

const formatLastmod = (updatedAt: string): string => new Date(updatedAt).toISOString().split('T')[0]

const escapeXml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')

type LocalizedEntry = {
    loc: string
    lastmod: string
    alternates: Array<{ lang: string; url: string }>
}

type SimpleEntry = {
    loc: string
    lastmod: string
}

const renderLocalizedSitemap = (urls: LocalizedEntry[]): string =>
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls
    .map(
        ({ loc, lastmod, alternates }) =>
            `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
${alternates
    .map((alt) => `    <xhtml:link rel="alternate" hreflang="${alt.lang}" href="${escapeXml(alt.url)}"/>`)
    .join('\n')}
  </url>`,
    )
    .join('\n')}
</urlset>`

const renderSimpleSitemap = (urls: SimpleEntry[]): string =>
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
    .map(({ loc, lastmod }) => `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`)
    .join('\n')}
</urlset>`

const isExcludedPath = (path: string): boolean => path === '/404'

export const GET: RequestHandler = async () => {
    const payload = await getPayloadInstance()
    const baseUrl = PUBLIC_SITE_URL.replace(/\/$/, '')
    const localization = getLocalizationConfig(payload)
    const docs = await enumerateRoutableDocs(payload, projectMeta)

    if (localization) {
        const { defaultLocale } = localization
        const urls: LocalizedEntry[] = []

        for (const doc of docs) {
            const langs = Object.keys(doc.localizedPaths)
            if (langs.length === 0) continue
            if (Object.values(doc.localizedPaths).some(isExcludedPath)) continue

            const xDefaultLang = doc.localizedPaths[defaultLocale]
                ? defaultLocale
                : doc.localizedPaths.en
                    ? 'en'
                    : langs[0]
            const xDefaultPath = doc.localizedPaths[xDefaultLang]
            const xDefaultUrl = `${baseUrl}/${xDefaultLang}${xDefaultPath === '/' ? '' : xDefaultPath}`

            const alternates = [
                { lang: 'x-default', url: xDefaultUrl },
                ...Object.entries(doc.localizedPaths).map(([lang, path]) => ({
                    lang,
                    url: `${baseUrl}/${lang}${path === '/' ? '' : path}`,
                })),
            ]

            const lastmod = formatLastmod(doc.updatedAt)
            for (const [lang, path] of Object.entries(doc.localizedPaths)) {
                urls.push({
                    loc: `${baseUrl}/${lang}${path === '/' ? '' : path}`,
                    lastmod,
                    alternates,
                })
            }
        }

        return new Response(renderLocalizedSitemap(urls), {
            headers: {
                'Content-Type': 'application/xml',
                'Cache-Control': 'max-age=3600',
            },
        })
    }

    const urls: SimpleEntry[] = []
    for (const doc of docs) {
        for (const path of Object.values(doc.localizedPaths)) {
            if (isExcludedPath(path)) continue
            urls.push({
                loc: `${baseUrl}${path === '/' ? '' : path}`,
                lastmod: formatLastmod(doc.updatedAt),
            })
        }
    }

    return new Response(renderSimpleSitemap(urls), {
        headers: {
            'Content-Type': 'application/xml',
            'Cache-Control': 'max-age=3600',
        },
    })
}
