import type { Handle } from '@sveltejs/kit'
import { validatePreviewToken, PREVIEW_COOKIE_NAME, PREVIEW_QUERY_PARAM } from './previewAuth'
import { resolveAdminUrlForPath } from './resolveAdminUrlForPath'

/**
 * Canonical svelteload hooks. Every project's `apps/web/src/hooks.server.ts`
 * is a one-line re-export of `handle` from this module.
 *
 * Reads its config from `process.env`:
 *
 *   PUBLIC_PAYLOAD_ADMIN_URL  - cms admin origin (for the gatekeeper "Open CMS" deep-link)
 *   PUBLIC_PREVIEW_URL        - preview-subdomain origin; requests whose host matches this trigger preview-gate behavior
 *
 * Behavior:
 *
 *  1. Blocks common scanner/recon paths (.php, wp-*, .env, etc) with 404
 *  2. 301-redirects any uppercase URL path to its lowercase equivalent
 *  3. Sets `event.locals.isPreview` (host matches preview-host) and
 *     `event.locals.isInIframe` (Sec-Fetch-Dest: iframe — true inside Payload's
 *     live-preview pane, used by the layout to hide the preview banner)
 *  4. On the preview host without a valid `preview_key` query or cookie:
 *     renders a 401 gatekeeper page with an "Open CMS" link that deep-links
 *     to the requested page in admin (or admin root if no doc matches)
 *  5. Otherwise resolves the request normally; on the preview host inlines
 *     external CSS so the gatekeeper / preview iframe doesn't depend on
 *     same-origin asset URLs
 */

const PREVIEW_HOST: string | null = (() => {
    const url = process.env.PUBLIC_PREVIEW_URL
    if (!url) return null
    try { return new URL(url).host } catch { return null }
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

export const handle: Handle = async ({ event, resolve }) => {
    const { url } = event
    const adminUrl = process.env.PUBLIC_PAYLOAD_ADMIN_URL

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
    event.locals.isInIframe = event.request.headers.get('sec-fetch-dest') === 'iframe'

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

    const response = await resolve(event)
    if (!isPreviewHost) return response
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) return response
    return inlineStylesheets(response, event.url.origin)
}
