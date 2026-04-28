import type { Handle } from '@sveltejs/kit'
import { parse } from 'cookie'
import { PUBLIC_PAYLOAD_ADMIN_URL, PUBLIC_PREVIEW_URL } from '$env/static/public'
import { payloadConfigBase } from 'payload-config/payload-base.config'
import { projectMeta } from 'project-meta/projectMeta'
import { validatePreviewToken, PREVIEW_COOKIE_NAME, PREVIEW_QUERY_PARAM } from './previewAuth'
import { resolveAdminUrlForPath } from './resolveAdminUrlForPath'

const PREVIEW_HOST: string | null = (() => {
    if (!PUBLIC_PREVIEW_URL) return null
    try { return new URL(PUBLIC_PREVIEW_URL).host } catch { return null }
})()

const blockedPatterns = [
    /\.php$/i,
    /wp-admin/i,
    /wp-login/i,
    /wp-json/i,
    /xmlrpc/i,
    /wp-content/i,
    /wp-includes/i,
    /\.env$/i,
    /\.git/i,
    /composer\./i,
    /\.sql$/i,
    /installer/i,
    /backup/i,
]

function escapeHtmlAttr(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderGatekeeperHtml(adminUrl: string | undefined, deepLinkUrl: string | null): string {
    const target = deepLinkUrl ?? adminUrl
    const cmsButton = target
        ? `<a class="cta" href="${escapeHtmlAttr(target)}">Open CMS</a>`
        : ''
    const bg = 'var(--gatekeeper-bg, #f4eef8)'
    const fg = 'var(--gatekeeper-fg, #3a1768)'
    const ctaBg = 'var(--gatekeeper-cta-bg, #3a1768)'
    const ctaFg = 'var(--gatekeeper-cta-fg, #ffffff)'
    const ctaBgHover = 'var(--gatekeeper-cta-bg-hover, #693e90)'
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Authenticated access only</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: ${bg}; color: ${fg}; padding: 2rem; }
  main { max-width: 520px; text-align: center; }
  h1 { font-size: 1.5rem; margin: 0 0 1rem; }
  p { line-height: 1.5; margin: 0 0 0.75rem; }
  .cta { display: inline-block; margin: 1.5rem 0; padding: 12px 28px; background: ${ctaBg}; color: ${ctaFg}; text-decoration: none; border-radius: 6px; font-size: 0.95rem; font-weight: 500; transition: background 0.2s; }
  .cta:hover { background: ${ctaBgHover}; }
  code { background: rgba(0, 0, 0, 0.08); padding: 0.1em 0.4em; border-radius: 4px; font-size: 0.95em; }
</style>
</head>
<body>
<main>
<h1>Authenticated access only</h1>
<p>This is a preview environment. Content editors can view it by opening the CMS and clicking the <strong>Live preview</strong> eye icon on any page.</p>
${cmsButton}
<p>If someone shared a preview link with you, it may have expired. Ask them to open live preview again and share the refreshed link.</p>
</main>
</body>
</html>`
}

const STYLESHEET_LINK_REGEX = /<link href="(\/_app\/immutable\/[^"]+\.css)" rel="stylesheet">/g

async function inlineStylesheets(response: Response, origin: string): Promise<Response> {
    let html = await response.text()
    const matches = [...html.matchAll(STYLESHEET_LINK_REGEX)]
    const resolved = await Promise.all(matches.map(async ([tag, path]) => {
        try {
            const res = await fetch(`${origin}${path}`)
            if (!res.ok) return null
            return { tag, css: await res.text() }
        } catch {
            return null
        }
    }))
    for (const r of resolved) {
        if (r) html = html.replace(r.tag, `<style>${r.css}</style>`)
    }
    const headers = new Headers(response.headers)
    headers.delete('content-length')
    return new Response(html, {
        status: response.status,
        statusText: response.statusText,
        headers,
    })
}

async function previewAuthOk(event: Parameters<Handle>[0]['event']): Promise<boolean> {
    const queryToken = event.url.searchParams.get(PREVIEW_QUERY_PARAM)
    if (queryToken) {
        const result = await validatePreviewToken(queryToken)
        if (result.valid) {
            const maxAge = Math.max(0, Math.floor((result.expiresAt.getTime() - Date.now()) / 1000))
            event.cookies.set(PREVIEW_COOKIE_NAME, queryToken, {
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'none',
                maxAge,
            })
            return true
        }
    }

    const cookieToken = event.cookies.get(PREVIEW_COOKIE_NAME)
    if (cookieToken) {
        const result = await validatePreviewToken(cookieToken)
        if (result.valid) return true
        event.cookies.delete(PREVIEW_COOKIE_NAME, { path: '/' })
    }

    return false
}

function isStaticAsset(pathname: string): boolean {
    return (
        pathname.startsWith('/_app/') ||
        pathname === '/favicon.ico' ||
        pathname === '/robots.txt' ||
        /\.(css|js|mjs|map|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|avif|ico)$/i.test(pathname)
    )
}

function isLocaleBypassPath(pathname: string): boolean {
    if (
        pathname.startsWith('/api') ||
        pathname.startsWith('/media') ||
        pathname.includes('.well-known') ||
        pathname.endsWith('favicon.ico') ||
        pathname.endsWith('favicon.png') ||
        pathname.endsWith('robots.txt') ||
        pathname.endsWith('sitemap.xml') ||
        pathname.endsWith('.json') ||
        pathname.endsWith('.xml') ||
        pathname.endsWith('.txt')
    ) return true
    const extras = (projectMeta as { localeBypassPaths?: string[] }).localeBypassPaths
    if (extras && extras.length > 0) {
        return extras.some(prefix => pathname.startsWith(prefix))
    }
    return false
}

function getLocaleConfig(): { locales: string[], defaultLocale: string } | null {
    const loc = (payloadConfigBase as { localization?: any }).localization
    if (!loc) return null
    const rawLocales = loc.locales as Array<string | { code: string }> | undefined
    const locales = rawLocales?.map(l => typeof l === 'string' ? l : l.code).filter(Boolean) as string[] | undefined
    if (!locales || locales.length === 0) return null
    return { locales, defaultLocale: loc.defaultLocale ?? locales[0] }
}

export const handle: Handle = async ({ event, resolve }) => {
    const { url, request } = event
    const adminUrl = PUBLIC_PAYLOAD_ADMIN_URL

    if (blockedPatterns.some(pattern => pattern.test(url.pathname))) {
        return new Response('Not Found', { status: 404 })
    }

    if (url.pathname !== url.pathname.toLowerCase()) {
        return new Response(null, {
            status: 301,
            headers: { Location: url.pathname.toLowerCase() + url.search },
        })
    }

    const isPreviewHost = PREVIEW_HOST !== null && event.url.host === PREVIEW_HOST
    event.locals.isPreview = isPreviewHost
    event.locals.isInIframe = request.headers.get('sec-fetch-dest') === 'iframe'

    if (isPreviewHost && !isStaticAsset(url.pathname) && !(await previewAuthOk(event))) {
        const deepLinkUrl = await resolveAdminUrlForPath(url.pathname, adminUrl).catch(() => null)
        return new Response(renderGatekeeperHtml(adminUrl, deepLinkUrl), {
            status: 401,
            headers: {
                'content-type': 'text/html; charset=utf-8',
                'x-robots-tag': 'noindex, nofollow',
            },
        })
    }

    const localeConfig = getLocaleConfig()
    let currentLang: string | null = null

    if (localeConfig && !isLocaleBypassPath(url.pathname)) {
        const { locales, defaultLocale } = localeConfig
        const langMatch = /^\/([a-z]{2})(\/|$)/.exec(url.pathname)
        currentLang = langMatch ? langMatch[1] : null

        if (!currentLang || !locales.includes(currentLang)) {
            const cookies = parse(request.headers.get('cookie') || '')
            let detectedLang = cookies['lang']

            if (!detectedLang || !locales.includes(detectedLang)) {
                const acceptLang = request.headers.get('accept-language')
                const browserLangs = acceptLang
                    ? acceptLang.split(',').map(l => l.split('-')[0].split(';')[0].trim())
                    : []
                detectedLang = browserLangs.find(l => locales.includes(l)) || defaultLocale
            }

            const pathWithoutLang = currentLang ? url.pathname.replace(`/${currentLang}`, '') : url.pathname
            const newPath = `/${detectedLang}${pathWithoutLang === '/' ? '' : pathWithoutLang}`
            return new Response(null, {
                status: 302,
                headers: { Location: newPath + url.search },
            })
        }
    }

    const response = await resolve(event, {
        transformPageChunk: ({ html }) => {
            if (currentLang) return html.replace('%sveltekit.lang%', currentLang)
            return html
        },
    })

    if (!isPreviewHost) return response
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) return response
    return inlineStylesheets(response, event.url.origin)
}
