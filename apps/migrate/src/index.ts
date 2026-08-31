/**
 * Moves one Svelteload site into nodebrush-app. Run once per project, on the day the sites move, and
 * then delete this app.
 *
 * It lives here rather than in nodebrush-app deliberately. It reads a Payload-era site and it will
 * never be needed again, and putting it in the app would leave that app carrying a reader of a stack
 * it exists to replace.
 *
 *     node --experimental-strip-types src/index.ts \
 *       --site https://www.viscioekonomi.se \
 *       --app https://app.nodebrush.com \
 *       --token sla_... \
 *       --browser wss://browserless.nodebrush.com?token=... \
 *       [--dry]
 *
 * Nothing is written until every page has been read, so a failure halfway leaves the target
 * untouched rather than half a site.
 */

import { existsSync } from 'node:fs'
import { connect, launch, type Browser, type Page } from 'puppeteer-core'
import { readDocument, type CapturedPage, type CapturedSection } from './read.ts'
import { mapTheme, retokenize, unreachable } from './theme.ts'
import { carryImages, repoint } from './media.ts'

interface Options {
    site: string
    app: string
    token: string
    browser: string
    chrome: string
    dry: boolean
    limit: number
}

/**
 * A migration is run by hand, from a machine that already has a browser on it, so the browserless
 * instance is one hop and one credential this does not need. `--chrome` launches the local one
 * instead, which is also faster: every screenshot and every read stops crossing the network.
 */
const LOCAL_CHROME = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

function options(): Options {
    const argv = process.argv.slice(2)
    const value = (name: string, fallback = '') => {
        const at = argv.indexOf(`--${name}`)
        if (at === -1) return fallback
        const next = argv[at + 1]
        // A flag used on its own takes no value, and without this `--chrome --dry` reads the second
        // flag as the first one's argument and then fails looking for a browser called "--dry".
        return next && !next.startsWith('--') ? next : fallback
    }

    const parsed: Options = {
        site: value('site').replace(/\/$/, ''),
        app: value('app', 'https://app.nodebrush.com').replace(/\/$/, ''),
        token: value('token', process.env.NODEBRUSH_APP_TOKEN ?? ''),
        browser: value('browser', process.env.BROWSERLESS_URL ?? ''),
        chrome: value('chrome', argv.includes('--chrome') ? '' : (existsSync(LOCAL_CHROME[0]) ? LOCAL_CHROME[0] : '')),
        dry: argv.includes('--dry'),
        limit: Number(value('limit', '200')),
    }

    if (!parsed.chrome && argv.includes('--chrome')) {
        const found = LOCAL_CHROME.find((candidate) => existsSync(candidate))
        if (!found) throw new Error('No local Chrome or Edge found. Pass --chrome <path to the binary>.')
        parsed.chrome = found
    }

    if (!parsed.site) throw new Error('--site is required')
    if (!parsed.dry && !parsed.token) throw new Error('--token is required unless --dry')
    if (!parsed.browser && !parsed.chrome) {
        throw new Error('Either --chrome, to drive the browser on this machine, or --browser wss://…')
    }
    return parsed
}

async function openBrowser(opts: Options): Promise<Browser> {
    if (opts.chrome) {
        return launch({ executablePath: opts.chrome, headless: true, args: ['--no-sandbox'] })
    }
    return connect({ browserWSEndpoint: opts.browser })
}

/**
 * Every address the site publishes, grouped so the same page in two languages is one entry. The
 * sitemap already carries the hreflang links, which is exactly the grouping needed and is why this
 * does not have to guess from path shapes.
 */
async function sitemap(origin: string): Promise<Array<Record<string, string>>> {
    const response = await fetch(`${origin}/sitemap.xml`)
    if (!response.ok) throw new Error(`No sitemap at ${origin}/sitemap.xml`)
    const xml = await response.text()

    const groups: Array<Record<string, string>> = []
    const seen = new Set<string>()

    for (const block of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
        const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1]
        if (!loc || seen.has(loc)) continue

        const group: Record<string, string> = {}
        for (const link of block.match(/<xhtml:link[^>]*>/g) ?? []) {
            const hreflang = link.match(/hreflang="([^"]+)"/)?.[1]
            const href = link.match(/href="([^"]+)"/)?.[1]
            if (hreflang && href && hreflang !== 'x-default') group[hreflang] = href
        }

        if (Object.keys(group).length === 0) {
            const language = new URL(loc).pathname.split('/')[1]
            group[/^[a-z]{2}$/.test(language) ? language : 'en'] = loc
        }

        for (const href of Object.values(group)) seen.add(href)
        groups.push(group)
    }

    return groups
}

async function capture(page: Page, url: string) {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45_000 })
    // Everything below the fold has to have been asked for, or half the pictures come back as the
    // lazy-loading placeholder rather than as the image.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await new Promise((resolve) => setTimeout(resolve, 600))
    await page.evaluate(() => window.scrollTo(0, 0))
    return page.evaluate(readDocument)
}

function pathOf(url: string): { locale: string; path: string } {
    const { pathname } = new URL(url)
    const [, first, ...rest] = pathname.replace(/\/$/, '').split('/')
    const locale = /^[a-z]{2}(-[a-z0-9]+)?$/i.test(first ?? '') ? first : ''
    const path = `/${(locale ? rest : [first, ...rest]).filter(Boolean).join('/')}`
    return { locale: locale || 'en', path: path === '/' ? '/' : path }
}

/**
 * The same section in another language, as a map from run index to the words there. The markup is the
 * same tree in both, because it is the same components rendering the same blocks, so the runs line up
 * one for one. Where they do not the section is skipped rather than written wrong, which is the one
 * outcome worth refusing.
 */
function translate(source: CapturedSection, other: CapturedSection | undefined): Record<string, string> {
    if (!other || other.runs.length !== source.runs.length) return {}

    const text: Record<string, string> = {}
    source.runs.forEach((run, index) => {
        const translated = other.runs[index]
        if (translated && translated !== run) text[String(index)] = translated
    })
    return text
}

async function main() {
    const opts = options()
    const groups = (await sitemap(opts.site)).slice(0, opts.limit)
    console.log(`${groups.length} pages in the sitemap`)

    const browser: Browser = await openBrowser(opts)
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })

    const locales = [...new Set(groups.flatMap((group) => Object.keys(group)))]
    const own = locales[0]
    const pages: CapturedPage[] = []
    let variables: Record<string, string> = {}
    let company: Record<string, unknown> | null = null
    let header: CapturedSection | null = null
    let footer: CapturedSection | null = null
    const imageUrls = new Set<string>()

    try {
        for (const group of groups) {
            const primary = group[own] ?? Object.values(group)[0]
            const read = await capture(page, primary)
            const { path } = pathOf(primary)
            console.log(`read ${path}`)

            if (!Object.keys(variables).length) variables = read.variables
            if (!company) company = read.company

            const own_sections = read.sections.filter((entry) => entry.scope === 'page') as CapturedSection[]
            if (!header) header = (read.sections.find((entry) => entry.scope === 'header') as CapturedSection) ?? null
            if (!footer) footer = (read.sections.find((entry) => entry.scope === 'footer') as CapturedSection) ?? null

            for (const section of read.sections) for (const image of section.images) imageUrls.add(image)

            const captured: CapturedPage = {
                path,
                paths: Object.fromEntries(
                    Object.entries(group).map(([locale, href]) => [locale, pathOf(href).path]),
                ),
                title: read.title,
                meta: {
                    title: { [own]: read.meta.title },
                    description: { [own]: read.meta.description },
                    image: read.meta.image,
                },
                sections: own_sections,
                translations: {},
            }

            for (const [locale, href] of Object.entries(group)) {
                if (locale === own) continue
                const other = await capture(page, href)
                captured.meta.title[locale] = other.meta.title
                captured.meta.description[locale] = other.meta.description
                captured.translations[locale] = { runs: [], title: other.title }

                const others = other.sections.filter((entry) => entry.scope === 'page')
                captured.sections = captured.sections.map((section, index) => ({
                    ...section,
                    // Carried on the section rather than on the page, since that is the shape the app
                    // stores: one markup, and a map of words per language.
                    localeText: {
                        ...((section as CapturedSection & { localeText?: Record<string, unknown> }).localeText ?? {}),
                        [locale]: translate(section, others[index] as CapturedSection | undefined),
                    },
                })) as CapturedSection[]
            }

            pages.push(captured)
        }
    } finally {
        await page.close().catch(() => undefined)
        // A launched browser is a process this started and has to end; a connected one belongs to
        // browserless and is only let go of. Closing the wrong way leaks a Chrome per run.
        if (opts.chrome) await browser.close().catch(() => undefined)
        else await browser.disconnect()
    }

    const mapping = mapTheme(variables)
    const palette = mapping.theme.palette as Record<string, string>
    const values: Record<string, string> = {
        accent: palette.accent,
        surface: palette.surface,
        'surface-alt': palette.surfaceAlt,
        'surface-inverse': palette.surfaceInverse,
        text: palette.text,
        'text-muted': palette.textMuted,
        'text-inverse': palette.textInverse,
        'border-color': palette.border,
        ...Object.fromEntries(mapping.extras.map((extra) => [extra.name, extra.value])),
    }

    const section = (entry: CapturedSection) => ({
        name: entry.name,
        html: entry.html,
        css: retokenize(entry.css, mapping, values),
        locales: Object.fromEntries(
            Object.entries(
                (entry as CapturedSection & { localeText?: Record<string, Record<string, string>> }).localeText ?? {},
            ).map(([locale, text]) => [locale, { text, alt: {} }]),
        ),
    })

    const payload = {
        slug: new URL(opts.site).hostname.replace(/^www\./, '').replace(/\./g, '-'),
        name: (company?.name as string) ?? new URL(opts.site).hostname,
        locales: locales.map((code) => ({ code, label: code, dateLocale: code === 'sv' ? 'sv-SE' : 'en-GB' })),
        theme: mapping.theme,
        company: company
            ? {
                  brandName: company.name,
                  legalName: company.legalName ?? company.name,
                  email: company.email ?? '',
                  phone: company.telephone ?? '',
                  socials: (company.sameAs as string[]) ?? [],
              }
            : undefined,
        header: header ? section(header) : undefined,
        footer: footer ? section(footer) : undefined,
        pages: pages.map((entry) => ({
            path: entry.path,
            paths: entry.paths,
            title: entry.title,
            meta: entry.meta,
            sections: entry.sections.map(section),
        })),
    }

    const literals = payload.pages
        .flatMap((entry) => entry.sections)
        .flatMap((entry) => unreachable(entry.css))
    if (literals.length) {
        console.log(
            `${literals.length} colours survived as literals and will not follow the theme: ` +
                `${[...new Set(literals)].slice(0, 12).join(', ')}`,
        )
    }

    console.log(`${imageUrls.size} image urls referenced`)

    if (opts.dry) {
        console.log(JSON.stringify({ ...payload, pages: payload.pages.length }, null, 2))
        return
    }

    // The site is written first with the old image addresses, so the upload has a site to belong to
    // and so a failure here leaves a site that renders from the previous host rather than one with
    // no pictures at all.
    const first = await put(opts, payload)
    console.log(`imported as site ${first.siteId}, ${first.sections} sections`)

    const carried = await carryImages([...imageUrls], opts.app, opts.token, first.siteId, (line) =>
        console.log(line),
    )
    console.log(`${carried.length} images carried across`)

    if (carried.length) {
        const repointed = {
            ...payload,
            header: payload.header ? { ...payload.header, html: repoint(payload.header.html, carried) } : undefined,
            footer: payload.footer ? { ...payload.footer, html: repoint(payload.footer.html, carried) } : undefined,
            pages: payload.pages.map((entry) => ({
                ...entry,
                sections: entry.sections.map((one) => ({ ...one, html: repoint(one.html, carried) })),
            })),
        }
        const second = await put(opts, repointed)
        console.log(`repointed ${second.sections} sections at the images now hosted here`)
    }

    if (first.findings?.length) {
        console.log(`${first.findings.length} sections carry something the token contract would refuse`)
        for (const finding of first.findings.slice(0, 5)) {
            console.log(`  ${finding.page} / ${finding.section}: ${finding.violations[0]?.message ?? ''}`)
        }
    }
}

interface Report {
    siteId: string
    sections: number
    findings?: Array<{ page: string; section: string; violations: Array<{ message: string }> }>
}

async function put(opts: Options, payload: unknown): Promise<Report> {
    const response = await fetch(`${opts.app}/api/sites`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.token}` },
        body: JSON.stringify(payload),
    })

    const report = await response.json().catch(() => null)
    if (!response.ok) throw new Error(`The app refused it: ${JSON.stringify(report)}`)
    return report as Report
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
