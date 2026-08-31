/**
 * What the live site is, read out of the live site.
 *
 * Reading Payload instead was the obvious plan and it is worse in every way that matters here. A
 * block is a row whose appearance lives in a Svelte component, so Payload knows what the content is
 * and nothing about what it looks like; the rendered page knows both. Payload also differs per
 * project, which would make this a tool per site, while every Svelteload site renders the same shape
 * of document and publishes a sitemap naming every address in every language.
 *
 * So: the sitemap is the page list, the rendered document is the design, and the same page in another
 * language is the translation. Nothing here imports a project's config, which is why one tool moves
 * all six.
 */

export interface CapturedSection {
    name: string
    scope: 'header' | 'footer' | 'page'
    html: string
    css: string
    /** Every run of text in the order the markup holds them, for matching against another language. */
    runs: string[]
    images: string[]
}

export interface CapturedPage {
    /** The address in the site's own language, without the language segment. */
    path: string
    paths: Record<string, string>
    title: string
    meta: { title: Record<string, string>; description: Record<string, string>; image: string }
    sections: CapturedSection[]
    /** The same page in another language, keyed by locale, holding one run per run above. */
    translations: Record<string, { runs: string[]; title: string }>
}

export interface CapturedPost {
    /** What the app addresses it by, taken off the end of the path. */
    slug: string
    title: string
    excerpt: string
    /** The prose, as markup, which is the one document field that holds html rather than a value. */
    body: string
    /** ISO, from a <time datetime> where the page has one. Empty when the page never says. */
    date: string
    image: string
    tags: string[]
    /**
     * The post's own section, with data-field written onto the elements holding each of the values
     * above. One of these becomes the page that every document of this type renders through, so it
     * is the design of a post rather than one post's content.
     */
    template: string
    css: string
}

export interface CapturedSite {
    origin: string
    locales: string[]
    /** Every custom property `:root` defines, which is where a Svelteload project keeps its palette. */
    variables: Record<string, string>
    company: Record<string, unknown> | null
    header: CapturedSection | null
    footer: CapturedSection | null
    pages: CapturedPage[]
}

/**
 * Runs in the page, so it has no imports and cannot close over anything. Same constraint as
 * `pageProbe.ts` in nodebrush-app and for the same reason: puppeteer serializes the function and
 * evaluates it somewhere else.
 */
export function readDocument(): {
    title: string
    lang: string
    variables: Record<string, string>
    company: Record<string, unknown> | null
    meta: { title: string; description: string; image: string }
    sections: Array<{ name: string; scope: string; html: string; css: string; runs: string[]; images: string[] }>
} {
    const root = document.documentElement

    // Every custom property the project defines on :root. A Svelteload project keeps its whole palette
    // there, which is why the theme comes across exactly rather than being measured off pixels.
    const variables: Record<string, string> = {}
    for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList
        try {
            rules = sheet.cssRules
        } catch {
            continue
        }
        for (const rule of Array.from(rules)) {
            const style = (rule as CSSStyleRule).style
            const selector = (rule as CSSStyleRule).selectorText
            if (!style || !selector || !/(^|,)\s*(:root|html)\s*(,|$)/.test(selector)) continue
            for (const property of Array.from(style)) {
                if (property.startsWith('--')) variables[property] = style.getPropertyValue(property).trim()
            }
        }
    }

    const ldScript = document.querySelector('script[type="application/ld+json"]')
    let company: Record<string, unknown> | null = null
    if (ldScript?.textContent) {
        try {
            const parsed = JSON.parse(ldScript.textContent)
            const graph = Array.isArray(parsed) ? parsed : (parsed['@graph'] ?? [parsed])
            company = graph.find((entry: { '@type'?: string }) => entry['@type'] === 'Organization') ?? null
        } catch {
            company = null
        }
    }

    // Every rule that reaches anywhere inside this element. Svelte scopes with a hashed class and puts
    // everything in one bundle, so the only way to know what a section is styled by is to ask.
    const cssFor = (element: Element): string => {
        const collected: string[] = []

        const visit = (rules: CSSRuleList) => {
            for (const rule of Array.from(rules)) {
                const media = rule as CSSMediaRule
                if (media.media && media.cssRules) {
                    // Collected into the same list and then lifted back out, so a query keeps the
                    // rules that were inside it and a section keeps the widths it was designed at.
                    const before = collected.length
                    visit(media.cssRules)
                    const taken = collected.splice(before)
                    if (taken.length) collected.push(`@media ${media.conditionText} { ${taken.join(' ')} }`)
                    continue
                }

                const style = rule as CSSStyleRule
                if (!style.selectorText) {
                    if ((rule as CSSKeyframesRule).name) collected.push(rule.cssText)
                    continue
                }

                const matches = style.selectorText.split(',').filter((selector) => {
                    const cleaned = selector.replace(/::?[a-z-]+(\([^)]*\))?/gi, '').trim()
                    if (!cleaned) return false
                    try {
                        return element.matches(cleaned) || element.querySelector(cleaned) !== null
                    } catch {
                        return false
                    }
                })

                if (matches.length) {
                    collected.push(`${matches.join(',')} { ${style.style.cssText} }`)
                }
            }
        }

        for (const sheet of Array.from(document.styleSheets)) {
            try {
                visit(sheet.cssRules)
            } catch {
                /* a stylesheet on another host cannot be read from script at all */
            }
        }

        return collected.join('\n')
    }

    const runsIn = (element: Element): string[] => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        const runs: string[] = []
        let node: Node | null
        while ((node = walker.nextNode())) {
            const parent = node.parentElement
            if (!parent || parent.closest('script, style')) continue
            if (node.textContent && node.textContent.length) runs.push(node.textContent)
        }
        return runs
    }

    const imagesIn = (element: Element): string[] =>
        Array.from(element.querySelectorAll('img')).map((image) => (image as HTMLImageElement).currentSrc || (image as HTMLImageElement).src)

    const describe = (element: Element, scope: string, index: number) => ({
        name:
            element.id ||
            element.getAttribute('data-section') ||
            (element.className && typeof element.className === 'string'
                ? element.className.split(/\s+/).find((entry) => entry && !entry.startsWith('svelte-')) ?? ''
                : '') ||
            `${scope}-${index + 1}`,
        scope,
        html: element.outerHTML,
        css: cssFor(element),
        runs: runsIn(element),
        images: imagesIn(element),
    })

    const header = document.querySelector('header')
    const footer = document.querySelector('footer')
    const main = document.querySelector('main') ?? document.body

    const sections = Array.from(main.children)
        .filter((child) => !['SCRIPT', 'STYLE', 'HEADER', 'FOOTER'].includes(child.tagName))
        .map((child, index) => describe(child, 'page', index))

    return {
        title: document.title,
        lang: root.getAttribute('lang') ?? '',
        variables,
        company,
        meta: {
            title: document.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? document.title,
            description:
                document.querySelector('meta[name="description"]')?.getAttribute('content') ??
                document.querySelector('meta[property="og:description"]')?.getAttribute('content') ??
                '',
            image: document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '',
        },
        sections: [
            ...(header ? [describe(header, 'header', 0)] : []),
            ...sections,
            ...(footer ? [describe(footer, 'footer', 0)] : []),
        ],
    }
}

/**
 * A post, read as a document rather than as a page.
 *
 * The hard half is not the content, it is the template. Two hundred posts have to become two hundred
 * rows and one page, and that page has to carry `data-field` on the elements that hold the title, the
 * date, the picture and the prose. Working that out by counting text runs and splicing strings is
 * fragile in exactly the way this whole app avoids, so it is done here instead, where there is a real
 * DOM: the section is cloned, the fields are found by what they are, and the attributes are set on the
 * clone. What comes back is markup the app can already bind, produced by the browser rather than by a
 * regular expression.
 *
 * The original is never touched, so the same page can still be read as a page if it turns out not to
 * be a document after all.
 */
export function readPost(): {
    title: string
    excerpt: string
    body: string
    date: string
    image: string
    tags: string[]
    template: string
    css: string
} | null {
    const main = document.querySelector('main') ?? document.body

    // The post's own section is the one holding the h1. A layout usually wraps it in a hero and a
    // body, and taking the whole main would take the related-posts grid with it.
    const heading = main.querySelector('h1')
    if (!heading) return null

    const container =
        Array.from(main.children).find((child) => child.contains(heading)) ?? (main as Element)

    const time = container.querySelector('time[datetime]') as HTMLTimeElement | null

    // The prose, which is the element holding the most text that is not the heading itself. A post
    // body is always the longest thing on the page by a wide margin, so this does not need to know
    // what any project calls its content wrapper.
    let prose: Element | null = null
    let longest = 0
    container.querySelectorAll('div, article, section').forEach((element) => {
        if (element.contains(heading)) return
        const length = (element.textContent ?? '').trim().length
        if (length > longest) {
            longest = length
            prose = element
        }
    })

    const picture = container.querySelector('img') as HTMLImageElement | null

    const tags = Array.from(container.querySelectorAll('[class*="tag" i], [class*="category" i]'))
        .map((element) => (element.textContent ?? '').trim())
        .filter((text) => text.length > 0 && text.length < 40)

    // Everything below is done on a clone, so marking the fields cannot change the page that is
    // still being read.
    const clone = container.cloneNode(true) as Element
    const mark = (source: Element | null, field: string) => {
        if (!source) return
        // The same position in the clone, reached by walking the index path rather than by a
        // selector, since a hashed Svelte class is not something to match on twice.
        const path: number[] = []
        let node: Element | null = source
        while (node && node !== container) {
            const parent: Element | null = node.parentElement
            if (!parent) break
            path.unshift(Array.prototype.indexOf.call(parent.children, node))
            node = parent
        }
        let target: Element | null = clone
        for (const index of path) target = (target?.children[index] as Element) ?? null
        target?.setAttribute('data-field', field)
    }

    mark(heading, 'title')
    mark(time, 'date')
    mark(picture, 'image')
    mark(prose, 'body')

    const cssFor = (element: Element): string => {
        const collected: string[] = []
        for (const sheet of Array.from(document.styleSheets)) {
            let rules: CSSRuleList
            try {
                rules = sheet.cssRules
            } catch {
                continue
            }
            for (const rule of Array.from(rules)) {
                const style = rule as CSSStyleRule
                if (!style.selectorText) continue
                const matches = style.selectorText.split(',').filter((selector) => {
                    const cleaned = selector.replace(/::?[a-z-]+(\([^)]*\))?/gi, '').trim()
                    if (!cleaned) return false
                    try {
                        return element.matches(cleaned) || element.querySelector(cleaned) !== null
                    } catch {
                        return false
                    }
                })
                if (matches.length) collected.push(`${matches.join(',')} { ${style.style.cssText} }`)
            }
        }
        return collected.join('\n')
    }

    return {
        title: (heading.textContent ?? '').trim(),
        excerpt:
            document.querySelector('meta[name="description"]')?.getAttribute('content') ??
            document.querySelector('meta[property="og:description"]')?.getAttribute('content') ??
            '',
        body: prose ? (prose as Element).innerHTML : '',
        date: time?.getAttribute('datetime') ?? '',
        image: picture?.currentSrc || picture?.src || '',
        tags: Array.from(new Set(tags)),
        // The app binds one item on a detail page, so the template is written the way every other
        // listing is written and nothing new has to understand it.
        template: `<div data-bind="document"><article data-item>${clone.outerHTML}</article></div>`,
        css: cssFor(container),
    }
}
