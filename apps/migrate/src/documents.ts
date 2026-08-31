/**
 * The half of a Svelteload site that is rows rather than pages.
 *
 * A blog post, a project, a job and an employee are all pages in the sitemap, and moving them across
 * as pages is the wrong answer twice over: the listing that was supposed to show them binds to
 * nothing, and the client can never write the two hundred and first one. They have to arrive as
 * documents, which means one page holding the design and a row per post.
 *
 * Which addresses are documents is not something to guess at. A path prefix is what the old site
 * already used to say so, so that is what this takes, and `--dry` prints what the sitemap looks like
 * grouped by prefix so the flag can be written from evidence rather than from memory.
 */

export interface TypePlan {
    /** What the app calls the type, and what a section binds to: blog, projects, jobs. */
    slug: string
    /** Where its documents live in the site's own language. */
    prefix: string
    /** And in each of the others, learnt from the sitemap rather than declared. */
    prefixes: Record<string, string>
}

/** `blog:/blog,projects:/projekt` as it is typed on the command line. */
export function parseTypes(spec: string): TypePlan[] {
    if (!spec.trim()) return []

    return spec
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
            const [slug, prefix] = entry.split(':').map((part) => part.trim())
            if (!/^[a-z][a-z0-9-]{0,40}$/.test(slug ?? '')) {
                throw new Error(`"${entry}" is not a type. Write it as blog:/blog`)
            }
            if (!prefix?.startsWith('/')) {
                throw new Error(`"${entry}" has no path prefix. Write it as blog:/blog`)
            }
            return { slug, prefix: prefix.replace(/\/$/, ''), prefixes: {} }
        })
}

export function isUnder(path: string, prefix: string): boolean {
    return path.startsWith(`${prefix}/`) && path.slice(prefix.length + 1).length > 0
}

export function slugOf(path: string): string {
    return path.split('/').filter(Boolean).pop() ?? ''
}

/**
 * What the sitemap looks like grouped by first segment, so somebody writing the flag can see that
 * eleven addresses sit under /blog and two under /om-oss and tell which of those is a type.
 */
export function describeShape(paths: string[]): string {
    const counts = new Map<string, number>()
    for (const path of paths) {
        const [, first] = path.split('/')
        if (!first) continue
        counts.set(`/${first}`, (counts.get(`/${first}`) ?? 0) + 1)
    }

    return [...counts.entries()]
        .filter(([, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])
        .map(([prefix, count]) => `  ${prefix} has ${count} addresses under it`)
        .join('\n')
}

/**
 * Learns each type's prefix in every other language off the documents themselves. A Swedish blog
 * lives at /nyheter and an English one at /news, and the sitemap already pairs them, so nothing here
 * has to be told.
 */
export function learnPrefixes(plan: TypePlan, groups: Array<Record<string, string>>, own: string, pathOf: (url: string) => { path: string }): void {
    for (const group of groups) {
        const ownPath = group[own] ? pathOf(group[own]).path : ''
        if (!ownPath || !isUnder(ownPath, plan.prefix)) continue

        for (const [locale, href] of Object.entries(group)) {
            if (locale === own || plan.prefixes[locale]) continue
            const path = pathOf(href).path
            const at = path.lastIndexOf('/')
            if (at > 0) plan.prefixes[locale] = path.slice(0, at)
        }
    }
}

export interface DocumentPayload {
    slug: string
    slugs: Record<string, string>
    status: 'published'
    publishedAt: string | null
    tags: string[]
    content: Record<string, { title: string; excerpt: string; body: string; metaTitle: string; metaDescription: string }>
    imageToken?: string | null
    /**
     * The address this post's picture had on the old site. Held only until the uploads come back with
     * the token that replaced it, and never sent: the app has no idea what the previous host called
     * anything.
     */
    sourceImage?: string
}

/**
 * A document's picture, as the token it is now served under here. The uploads report which old
 * addresses each new file replaced, so this is a lookup rather than a second fetch.
 */
export function tokenFor(sourceImage: string, carried: Array<{ sources: string[]; url: string }>): string | null {
    if (!sourceImage) return null
    const match = carried.find((image) => image.sources.includes(sourceImage))
    return match ? (match.url.split('/').pop() ?? null) : null
}

/** What the app's documents endpoint takes: the type, and every document under it. */
export interface TypePayload {
    type: { slug: string; name: Record<string, string>; paths: Record<string, string>; detailPageId?: string }
    documents: DocumentPayload[]
}
