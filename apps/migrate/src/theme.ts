/**
 * The half of the migration that decides whether the moved site is still editable afterwards.
 *
 * A Svelteload project keeps its whole palette in custom properties on `:root`, and nodebrush-app's
 * token contract is also custom properties. So this is a rename rather than a measurement: map the
 * project's names onto the app's, rewrite every `var(--old)` in the captured css, and the site
 * arrives with "make the accent warmer" working on day one.
 *
 * What cannot be mapped is left alone and reported. A literal colour that survives is a section the
 * theme cannot reach, which is worth knowing before the site goes live rather than after somebody
 * asks for a change and finds out it takes a rewrite.
 */

/**
 * The names every Svelteload project uses, to the roles nodebrush-app names. Taken from the six
 * projects' layouts, which agree on far more than they disagree on because they were built from the
 * same starting point.
 */
const ROLES: Record<string, string[]> = {
    accent: ['accent', 'main-accent', 'primary', 'brand', 'teal-main', 'blue-accent'],
    surface: ['main-background', 'background-color', 'background', 'surface', 'white'],
    'surface-alt': ['html-background', 'main-bg', 'body-background', 'gray-ghost', 'blue-ghost', 'teal-ghost'],
    'surface-inverse': ['dark-blue-accent', 'blue-accent-dark', 'gray-dark', 'gray-deep', 'teal-dark'],
    text: ['text', 'text-color', 'body-text'],
    'text-muted': ['fourth-accent', 'bright-text', 'gray-soft', 'gray-light', 'muted'],
    'text-inverse': ['text-inverse', 'button-text', 'inverse-text'],
    'border-color': ['border', 'border-color', 'gray-fog', 'blue-light', 'tertiary-accent'],
    'font-heading': ['heading-font', 'font-heading', 'font'],
    'font-body': ['text-font', 'font-body', 'font'],
    radius: ['border-radius', 'radius'],
    shadow: ['block-shadow', 'shadow'],
}

export interface ThemeMapping {
    /** The app's theme, ready to send. */
    theme: Record<string, unknown>
    /** Project property name to the app's token name, for rewriting the captured css. */
    renames: Record<string, string>
    /** Project properties that map to nothing, kept as colours of the palette so nothing is lost. */
    extras: Array<{ name: string; value: string }>
}

const COLOUR = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i

export function mapTheme(variables: Record<string, string>): ThemeMapping {
    const flat = resolve(variables)
    const renames: Record<string, string> = {}
    const taken = new Set<string>()

    const pick = (role: string): string => {
        for (const candidate of ROLES[role] ?? []) {
            const value = flat[`--${candidate}`]
            if (!value || taken.has(candidate)) continue
            taken.add(candidate)
            renames[`--${candidate}`] = `--${role}`
            return value
        }
        return ''
    }

    const accent = pick('accent')
    const surface = pick('surface')
    const surfaceAlt = pick('surface-alt')
    const surfaceInverse = pick('surface-inverse')
    const text = pick('text')
    const textMuted = pick('text-muted')
    const textInverse = pick('text-inverse')
    const border = pick('border-color')
    const headingFamily = pick('font-heading')
    const bodyFamily = pick('font-body')
    const radius = pick('radius')
    const shadow = pick('shadow')

    // Everything the roles did not take. A project's fifth blue is a real colour that real sections
    // are written against, so it becomes a palette colour rather than being resolved to a literal.
    const extras: Array<{ name: string; value: string }> = []
    for (const [property, value] of Object.entries(flat)) {
        const name = property.slice(2)
        if (renames[property] || !COLOUR.test(value)) continue
        if (extras.length >= 12) break
        const safe = name.replace(/[^a-z0-9-]/g, '-').slice(0, 24)
        if (!safe || safe.startsWith('logo-')) continue
        extras.push({ name: safe, value })
        renames[property] = `--${safe}`
    }

    return {
        theme: {
            palette: {
                accent: accent || '#1f6feb',
                surface: surface || '#ffffff',
                surfaceAlt: surfaceAlt || '#f5f5f5',
                surfaceInverse: surfaceInverse || '#111111',
                text: text || '#111111',
                textMuted: textMuted || '#666666',
                textInverse: textInverse || '#ffffff',
                border: border || '#dddddd',
                colours: extras,
                logo: [],
            },
            type: {
                headingFamily: headingFamily || 'system-ui, sans-serif',
                bodyFamily: bodyFamily || headingFamily || 'system-ui, sans-serif',
                baseSize: pixels(flat['--base-font-size']) || 16,
            },
            shape: {
                radius: pixels(radius) || 4,
                shadow: shadow || 'none',
            },
        },
        renames,
        extras,
    }
}

/**
 * A project's palette is full of `--button: var(--accent)`, so a value has to be followed until it
 * is a colour. Without this every alias would arrive as an extra palette colour holding the text
 * `var(--accent)`, which resolves to nothing once the name it points at is gone.
 */
function resolve(variables: Record<string, string>): Record<string, string> {
    const flat: Record<string, string> = {}

    for (const [name, raw] of Object.entries(variables)) {
        let value = raw.trim()
        for (let hops = 0; hops < 8; hops++) {
            const reference = value.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)$/i)?.[1]
            if (!reference) break
            const next = variables[reference]
            if (!next) break
            value = next.trim()
        }
        flat[name] = value
    }

    return flat
}

function pixels(value: string | undefined): number {
    return Math.round(Number(String(value ?? '').match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 0))
}

/**
 * The captured css, pointed at the app's tokens. Every project property the mapping knows becomes the
 * app's name, and a literal that exactly equals a mapped value becomes that token too, since a
 * component that hardcoded the accent should still follow it afterwards.
 */
export function retokenize(css: string, mapping: ThemeMapping, values: Record<string, string>): string {
    let out = css

    for (const [from, to] of Object.entries(mapping.renames)) {
        out = out.replaceAll(new RegExp(`var\\(\\s*${from}\\b`, 'gi'), `var(${to}`)
    }

    for (const [token, value] of Object.entries(values)) {
        if (!COLOUR.test(value)) continue
        out = out.replaceAll(new RegExp(`(?<![\\w-])${escape(value)}(?![\\w-])`, 'gi'), `var(--${token})`)
    }

    return out
}

function escape(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** What survived as a literal, which is what the theme will not be able to reach. */
export function unreachable(css: string): string[] {
    const found = new Set<string>()
    for (const match of css.matchAll(/(#[0-9a-f]{3,8}\b|rgba?\([^)]*\))/gi)) found.add(match[1])
    return [...found]
}
