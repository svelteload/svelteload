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
 *       [--documents blog:/nyheter,projects:/projekt] \
 *       [--redirects ./old-paths.json] \
 *       [--dry]
 *
 * Nothing is written until every page has been read, so a failure halfway leaves the target
 * untouched rather than half a site.
 *
 * `--documents` is the one thing worth getting right. Without it every blog post in the sitemap
 * arrives as a page, which is wrong twice over: the listing that was meant to show them binds to
 * nothing, and the client can never write the next one. With it, each prefix becomes a document type,
 * every address under it becomes a row, and the first of them is read a second way to become the one
 * page the whole type renders through. Run `--dry` first: it prints the sitemap grouped by prefix,
 * which is what the flag should be written from.
 */

import { existsSync, readFileSync } from 'node:fs'
import { connect, launch, type Browser, type Page } from 'puppeteer-core'
import { readDocument, readPost, type CapturedPage, type CapturedSection } from './read.ts'
import { mapTheme, retokenize, unreachable } from './theme.ts'
import { carryImages, repoint } from './media.ts'
import {
    describeShape,
    isUnder,
    learnPrefixes,
    parseTypes,
    slugOf,
    tokenFor,
    type DocumentPayload,
    type TypePlan,
} from './documents.ts'

interface Options {
    site: string
    app: string
    token: string
    browser: string
    chrome: string
    dry: boolean
    limit: number
    /** `blog:/blog,projects:/projekt`. Everything under one of these arrives as a row, not a page. */
    types: TypePlan[]
    /** A json file of { from, to, status } for addresses the old site answered for and this must too. */
    redirects: string
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
        types: parseTypes(value('documents')),
        redirects: value('redirects'),
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

async function capturePage(page: Page, url: string) {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45_000 })
    // Everything below the fold has to have been asked for, or half the pictures come back as the
    // lazy-loading placeholder rather than as the image.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await new Promise((resolve) => setTimeout(resolve, 600))
    await page.evaluate(() => window.scrollTo(0, 0))
}

async function capture(page: Page, url: string) {
    await capturePage(page, url)
    return page.evaluate(readDocument)
}

/**
 * Every picture an html fragment points at, including the widths a srcset lists, since grouping those
 * back into one file is what `carryImages` does next.
 */
function sourcesIn(html: string): string[] {
    const found: string[] = []

    for (const match of html.matchAll(/\ssrc\s*=\s*"([^"]+)"/gi)) found.push(match[1])
    for (const match of html.matchAll(/\ssrcset\s*=\s*"([^"]+)"/gi)) {
        for (const candidate of match[1].split(',')) {
            const url = candidate.trim().split(/\s+/)[0]
            if (url) found.push(url)
        }
    }

    return found.filter((url) => url && !url.startsWith('data:'))
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

    // Which addresses are rows rather than pages. Learnt per language off the sitemap, so a blog at
    // /nyheter in Swedish and /news in English is one type with two prefixes and nothing declared.
    for (const plan of opts.types) learnPrefixes(plan, groups, own, pathOf)

    const typeOf = (group: Record<string, string>): TypePlan | null => {
        const primary = group[own] ?? Object.values(group)[0]
        const { path } = pathOf(primary)
        return opts.types.find((plan) => isUnder(path, plan.prefix)) ?? null
    }

    const pageGroups = groups.filter((group) => !typeOf(group))
    const documentGroups = groups.filter((group) => typeOf(group))

    if (opts.types.length === 0) {
        console.log(
            `no --documents given, so every address becomes a page. What the sitemap looks like:\n` +
                `${describeShape(groups.map((group) => pathOf(group[own] ?? Object.values(group)[0]).path))}`,
        )
    } else {
        console.log(`${documentGroups.length} of them are documents, ${pageGroups.length} are pages`)
    }

    const documents: Record<string, DocumentPayload[]> = {}
    const templates: Record<string, { html: string; css: string }> = {}
    const pages: CapturedPage[] = []
    let variables: Record<string, string> = {}
    let company: Record<string, unknown> | null = null
    let header: CapturedSection | null = null
    let footer: CapturedSection | null = null
    const imageUrls = new Set<string>()

    try {
        for (const group of pageGroups) {
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

        // The documents, read as rows. The first of each type is also read as the design every
        // document of that type will render through, so the design comes off a real post rather than
        // being written from a description of one.
        for (const group of documentGroups) {
            const plan = typeOf(group)!
            const primary = group[own] ?? Object.values(group)[0]
            const { path } = pathOf(primary)

            await capturePage(page, primary)
            const post = await page.evaluate(readPost)
            if (!post) {
                console.log(`skipped ${path}, no heading to read it by`)
                continue
            }

            // The hero, and every picture inside the prose. Missing the second set is how a post
            // reads correctly on the day of the move and loses its illustrations when the old
            // project is deleted.
            for (const image of [post.image, ...sourcesIn(post.body), ...sourcesIn(post.template)]) {
                if (image) imageUrls.add(image)
            }

            const content: DocumentPayload['content'] = {
                [own]: {
                    title: post.title,
                    excerpt: post.excerpt,
                    body: post.body,
                    metaTitle: post.title,
                    metaDescription: post.excerpt,
                },
            }
            const slugs: Record<string, string> = {}

            for (const [locale, href] of Object.entries(group)) {
                if (locale === own) continue
                await capturePage(page, href)
                const other = await page.evaluate(readPost)
                slugs[locale] = slugOf(pathOf(href).path)
                if (!other) continue
                content[locale] = {
                    title: other.title,
                    excerpt: other.excerpt,
                    body: other.body,
                    metaTitle: other.title,
                    metaDescription: other.excerpt,
                }
            }

            const list = documents[plan.slug] ?? (documents[plan.slug] = [])
            list.push({
                slug: slugOf(path),
                slugs,
                status: 'published',
                publishedAt: post.date || null,
                tags: post.tags,
                content,
                sourceImage: post.image,
            })

            if (!templates[plan.slug]) templates[plan.slug] = { html: post.template, css: post.css }
            console.log(`read ${path} as a ${plan.slug} document`)
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
        pages: [
            ...pages.map((entry) => ({
                path: entry.path,
                paths: entry.paths,
                title: entry.title,
                meta: entry.meta,
                sections: entry.sections.map(section),
            })),
            // One page per type, holding the design every document of that type renders through.
            // Its own address is reserved rather than real: it is a design, not somewhere to land,
            // and the app keeps an underscore-first path out of the sitemap for that reason.
            ...Object.entries(templates).map(([slug, built]) => ({
                path: `/_${slug}`,
                paths: {},
                title: `${slug} detail`,
                meta: { title: {}, description: {}, image: '' },
                sections: [
                    {
                        name: `${slug}-detail`,
                        html: built.html,
                        css: retokenize(built.css, mapping, values),
                        locales: {},
                    },
                ],
            })),
        ],
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
    for (const [slug, list] of Object.entries(documents)) {
        console.log(`${list.length} ${slug} documents`)
    }

    if (opts.dry) {
        console.log(
            JSON.stringify(
                { ...payload, pages: payload.pages.length, documents: Object.fromEntries(Object.entries(documents).map(([slug, list]) => [slug, list.length])) },
                null,
                2,
            ),
        )
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

    // The documents last, because each type has to name the page it renders through and that page
    // only has an id once the site has been written.
    if (Object.keys(documents).length) {
        const detailPages = await pagesOf(opts, first.siteId)

        for (const plan of opts.types) {
            const list = documents[plan.slug]
            if (!list?.length) continue

            const written = await putDocuments(opts, first.siteId, {
                type: {
                    slug: plan.slug,
                    name: { [locales[0]]: plan.slug },
                    paths: { [locales[0]]: plan.prefix, ...plan.prefixes },
                    detailPageId: detailPages[`/_${plan.slug}`],
                },
                documents: list.map(({ sourceImage, ...document }) => ({
                    ...document,
                    // The picture came across with every other image on the site, so what the row
                    // points at is the upload here rather than the address it had on the old host.
                    // The old address never leaves this tool.
                    imageToken: tokenFor(sourceImage ?? '', carried),
                    // A post's prose carries pictures of its own, and those are the ones that would
                    // have gone on pointing at the previous host until the day it was deleted.
                    content: Object.fromEntries(
                        Object.entries(document.content).map(([locale, fields]) => [
                            locale,
                            { ...fields, body: repoint(fields.body, carried) },
                        ]),
                    ),
                })),
            })
            console.log(`wrote ${written.written} ${plan.slug} documents, skipped ${written.skipped}`)
        }
    }

    if (opts.redirects) {
        const entries = JSON.parse(readFileSync(opts.redirects, 'utf8')) as Array<Record<string, unknown>>
        const report = await post(opts, `/api/design/${first.siteId}/redirects`, { redirects: entries })
        console.log(`wrote ${(report as { written: number }).written} redirects`)
    }

    if (first.findings?.length) {
        console.log(`${first.findings.length} sections carry something the token contract would refuse`)
        for (const finding of first.findings.slice(0, 5)) {
            console.log(`  ${finding.page} / ${finding.section}: ${finding.violations[0]?.message ?? ''}`)
        }
    }
}

/** Every page the import wrote, by path, so a type can name the one it renders through. */
async function pagesOf(opts: Options, siteId: string): Promise<Record<string, string>> {
    const response = await fetch(`${opts.app}/api/design/${siteId}/site`, {
        headers: { authorization: `Bearer ${opts.token}` },
    })
    if (!response.ok) throw new Error(`Could not read the site back: ${response.status}`)

    const body = (await response.json()) as { pages: Array<{ id: string; path: string }> }
    return Object.fromEntries(body.pages.map((page) => [page.path, page.id]))
}

async function putDocuments(
    opts: Options,
    siteId: string,
    body: unknown,
): Promise<{ written: number; skipped: number }> {
    const response = await fetch(`${opts.app}/api/design/${siteId}/documents`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.token}` },
        body: JSON.stringify(body),
    })

    const report = await response.json().catch(() => null)
    if (!response.ok) throw new Error(`The app refused the documents: ${JSON.stringify(report)}`)
    return report as { written: number; skipped: number }
}

async function post(opts: Options, path: string, body: unknown): Promise<unknown> {
    const response = await fetch(`${opts.app}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.token}` },
        body: JSON.stringify(body),
    })

    const report = await response.json().catch(() => null)
    if (!response.ok) throw new Error(`The app refused ${path}: ${JSON.stringify(report)}`)
    return report
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
