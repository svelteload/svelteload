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
