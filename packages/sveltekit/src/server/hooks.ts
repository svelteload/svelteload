import type { Handle } from '@sveltejs/kit'
import { parse, serialize } from 'cookie'
import { PUBLIC_PAYLOAD_ADMIN_URL, PUBLIC_PREVIEW_URL } from '$env/static/public'
import { VERCEL_ENV } from '$env/static/private'
import { payloadConfigBase } from 'payload-config/payload-base.config'
import { projectMeta } from 'project-meta/projectMeta'
import { validatePreviewToken, PREVIEW_COOKIE_NAME, PREVIEW_QUERY_PARAM } from './previewAuth'
import { resolveAdminUrlForPath } from './resolveAdminUrlForPath'
import { AUTH_COOKIE_NAME, sessionCookieDomain, verifySessionToken } from './sessionUser'
import { getPayloadInstance } from './payload'
import { PREVIEW_THEME_CSS } from '../components/preview/theme'

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

function renderPreviewLoginHtml(adminUrl: string | undefined, deepLinkUrl: string | null, error?: string): string {
    const target = deepLinkUrl ?? adminUrl
    const cmsLink = target ? `<a class="alt" href="${escapeHtmlAttr(target)}">Open the CMS instead</a>` : ''
    const base = adminUrl ? adminUrl.replace(/\/+$/, '') : ''
    const logo = base ? `<img class="logo" src="${escapeHtmlAttr(base)}/logo.png" alt="">` : ''
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Sign in</title>
<style>
${PREVIEW_THEME_CSS}
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 2.5rem 1.5rem;
    background: var(--sl-bg);
    color: var(--sl-text);
  }
  main { width: 100%; max-width: 30rem; }
  .logo { display: block; max-width: 100%; height: auto; max-height: 100px; margin: 0 auto 1rem; }
  .intro { color: var(--sl-muted); text-align: center; margin: 0 0 2rem; }
  label { display: block; margin: 0 0 0.5rem; }
  .req { color: var(--sl-required); }
  input {
    width: 100%;
    padding: 0.65rem 0.75rem;
    margin: 0 0 1.5rem;
    background: var(--sl-input-bg);
    color: var(--sl-text);
    border: 1px solid var(--sl-border);
    border-radius: 3px;
    font: inherit;
  }
  input:focus-visible { outline: none; border-color: var(--sl-muted); }
  input:-webkit-autofill,
  input:-webkit-autofill:hover,
  input:-webkit-autofill:focus {
    -webkit-text-fill-color: var(--sl-text);
    box-shadow: 0 0 0 100px var(--sl-input-bg) inset;
  }
  button {
    width: 100%;
    padding: 0.7rem;
    background: var(--sl-button-bg);
    color: var(--sl-button-text);
    border: 0;
    border-radius: 3px;
    font: inherit;
    cursor: pointer;
  }
  button:hover { opacity: 0.85; }
  .alt { display: block; text-align: center; margin-top: 1.5rem; color: var(--sl-text); font-size: 12px; }
  .err {
    background: var(--sl-error-bg);
    border: 1px solid var(--sl-error-border);
    color: var(--sl-error-text);
    padding: 0.6rem 0.75rem;
    border-radius: 3px;
    margin: 0 0 1.5rem;
  }
</style>
</head>
<body class="sl-preview">
<main>
${logo}
<p class="intro">Preview site. Sign in to review and publish drafts.</p>
<form method="post">
${error ? `<div class="err">${escapeHtmlAttr(error)}</div>` : ''}
<label for="email">Email <span class="req">*</span></label>
<input id="email" name="email" type="email" autocomplete="username" required>
<label for="password">Password <span class="req">*</span></label>
<input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Login</button>
</form>
${cmsLink}
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

function previewSessionOk(event: Parameters<Handle>[0]['event']): boolean {
    const token = event.cookies.get(AUTH_COOKIE_NAME)
    if (!token) return false
    if (verifySessionToken(token) !== null) return true
    event.cookies.delete(AUTH_COOKIE_NAME, { path: '/', domain: sessionCookieDomain(event.url.hostname) })
    return false
}

const SESSION_MAX_AGE = 7 * 24 * 60 * 60

// The gate returns its own Response instead of calling resolve(), and SvelteKit only
// attaches event.cookies.set() to a resolved response. The header has to be explicit.
// Secure unless the host is literally loopback. Deriving it from the protocol would read a
// forwarded header, so a proxy reporting http would silently drop Secure in production.
function sessionCookie(token: string, hostname: string): string {
    const loopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
    const domain = sessionCookieDomain(hostname)
    return serialize(AUTH_COOKIE_NAME, token, {
        path: '/',
        httpOnly: true,
        secure: !loopback,
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE,
        ...(domain ? { domain } : {}),
    })
}

async function attemptPreviewLogin(
    event: Parameters<Handle>[0]['event'],
): Promise<{ status: 'ok'; token: string } | { status: 'failed' | 'skip' }> {
    if (event.request.method !== 'POST') return { status: 'skip' }

    let form: FormData
    try {
        form = await event.request.formData()
    } catch (_) {
        return { status: 'skip' }
    }

    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    if (!email || !password) return { status: 'skip' }

    try {
        const payload = await getPayloadInstance()
        const result = await payload.login({ collection: 'users' as any, data: { email, password } })
        const token = (result as { token?: string }).token
        if (!token) return { status: 'failed' }

        return { status: 'ok', token }
    } catch (_) {
        return { status: 'failed' }
    }
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
    event.locals.isPreview = isPreviewHost || VERCEL_ENV === 'development'
    event.locals.isInIframe = request.headers.get('sec-fetch-dest') === 'iframe'

    if (isPreviewHost && !isStaticAsset(url.pathname)) {
        const authorised = previewSessionOk(event) || (await previewAuthOk(event))

        if (!authorised) {
            const attempt = await attemptPreviewLogin(event)

            if (attempt.status === 'ok') {
                return new Response(null, {
                    status: 303,
                    headers: {
                        Location: url.pathname + url.search,
                        'set-cookie': sessionCookie(attempt.token, url.hostname),
                    },
                })
            }

            const deepLinkUrl = await resolveAdminUrlForPath(url.pathname, adminUrl).catch(() => null)
            const error = attempt.status === 'failed' ? 'Those details did not match an account on this site.' : undefined
            return new Response(renderPreviewLoginHtml(adminUrl, deepLinkUrl, error), {
                status: 401,
                headers: {
                    'content-type': 'text/html; charset=utf-8',
                    'x-robots-tag': 'noindex, nofollow',
                },
            })
        }

        event.locals.previewUser = previewSessionOk(event)
    }

    const localeConfig = getLocaleConfig()
    let currentLang: string | null = null

    if (localeConfig) {
        const { locales, defaultLocale } = localeConfig
        if (locales.length > 1 && !isLocaleBypassPath(url.pathname)) {
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
        } else {
            currentLang = defaultLocale
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
