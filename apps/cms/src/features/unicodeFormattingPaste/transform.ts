/**
 * Maps Unicode Mathematical Alphanumeric Symbols (used by LinkedIn, Twitter
 * and other social apps for "formatted" text that survives copy-paste) back
 * to plain ASCII, along with the Lexical text-format flags that should be
 * applied. This lets a user paste LinkedIn-styled bold/italic content and
 * have it round-trip as real rich-text formatting instead of literal weird
 * glyphs.
 *
 * Ranges cover the contiguous A–Z, a–z, 0–9 blocks. Italicised small h at
 * U+210E and the "holey" positions (ℎ, ℬ, ℯ, etc.) are filled in as spot
 * overrides below.
 */

const BOLD_RANGES: Array<[number, number, number]> = [
    [ 0x1D400, 0x1D419, 0x41 ], // Mathematical Bold A–Z
    [ 0x1D41A, 0x1D433, 0x61 ], // Mathematical Bold a–z
    [ 0x1D468, 0x1D481, 0x41 ], // Mathematical Bold Italic A–Z
    [ 0x1D482, 0x1D49B, 0x61 ], // Mathematical Bold Italic a–z
    [ 0x1D4D0, 0x1D4E9, 0x41 ], // Mathematical Bold Script A–Z
    [ 0x1D4EA, 0x1D503, 0x61 ], // Mathematical Bold Script a–z
    [ 0x1D56C, 0x1D585, 0x41 ], // Mathematical Bold Fraktur A–Z
    [ 0x1D586, 0x1D59F, 0x61 ], // Mathematical Bold Fraktur a–z
    [ 0x1D5D4, 0x1D5ED, 0x41 ], // Mathematical Sans-Serif Bold A–Z (LinkedIn bold)
    [ 0x1D5EE, 0x1D607, 0x61 ], // Mathematical Sans-Serif Bold a–z
    [ 0x1D63C, 0x1D655, 0x41 ], // Mathematical Sans-Serif Bold Italic A–Z
    [ 0x1D656, 0x1D66F, 0x61 ], // Mathematical Sans-Serif Bold Italic a–z
    [ 0x1D7CE, 0x1D7D7, 0x30 ], // Mathematical Bold Digits 0–9
    [ 0x1D7EC, 0x1D7F5, 0x30 ], // Mathematical Sans-Serif Bold Digits 0–9
]

const ITALIC_RANGES: Array<[number, number, number]> = [
    [ 0x1D434, 0x1D44D, 0x41 ], // Mathematical Italic A–Z
    [ 0x1D44E, 0x1D467, 0x61 ], // Mathematical Italic a–z
    [ 0x1D608, 0x1D621, 0x41 ], // Mathematical Sans-Serif Italic A–Z (LinkedIn italic)
    [ 0x1D622, 0x1D63B, 0x61 ], // Mathematical Sans-Serif Italic a–z
]

const MONOSPACE_RANGES: Array<[number, number, number]> = [
    [ 0x1D670, 0x1D689, 0x41 ], // Mathematical Monospace A–Z
    [ 0x1D68A, 0x1D6A3, 0x61 ], // Mathematical Monospace a–z
    [ 0x1D7F6, 0x1D7FF, 0x30 ], // Mathematical Monospace Digits 0–9
]

// Unicode reserves a handful of characters in the middle of these ranges for
// older pre-existing symbols (ℎ, ℬ, ℯ, ℯ, etc.) — map them explicitly.
const HOLES: Record<number, { ascii: string, bold: boolean, italic: boolean }> = {
    0x210E: { ascii: 'h', bold: false, italic: true },   // Planck constant ℎ (italic h)
    0x212C: { ascii: 'B', bold: false, italic: false },  // ℬ script B
    0x2130: { ascii: 'E', bold: false, italic: false },  // ℰ script E
    0x2131: { ascii: 'F', bold: false, italic: false },  // ℱ script F
    0x210B: { ascii: 'H', bold: false, italic: false },  // ℋ script H
    0x2110: { ascii: 'I', bold: false, italic: false },  // ℐ script I
    0x2112: { ascii: 'L', bold: false, italic: false },  // ℒ script L
    0x2133: { ascii: 'M', bold: false, italic: false },  // ℳ script M
    0x211B: { ascii: 'R', bold: false, italic: false },  // ℛ script R
    0x212F: { ascii: 'e', bold: false, italic: false },  // ℯ script e
    0x210A: { ascii: 'g', bold: false, italic: false },  // ℊ script g
    0x2134: { ascii: 'o', bold: false, italic: false },  // ℴ script o
}

export type FormatFlags = {
    bold: boolean
    italic: boolean
}

export type FormattedRun = {
    text: string
    format: FormatFlags
}

function classify(codePoint: number): { ascii: string, bold: boolean, italic: boolean } | null {
    if (HOLES[codePoint]) return HOLES[codePoint]

    for (const [ start, end, asciiStart ] of BOLD_RANGES) {
        if (codePoint >= start && codePoint <= end) {
            return {
                ascii: String.fromCodePoint(asciiStart + ( codePoint - start )),
                bold: true,
                italic: false,
            }
        }
    }
    for (const [ start, end, asciiStart ] of ITALIC_RANGES) {
        if (codePoint >= start && codePoint <= end) {
            return {
                ascii: String.fromCodePoint(asciiStart + ( codePoint - start )),
                bold: false,
                italic: true,
            }
        }
    }
    for (const [ start, end, asciiStart ] of MONOSPACE_RANGES) {
        if (codePoint >= start && codePoint <= end) {
            return {
                ascii: String.fromCodePoint(asciiStart + ( codePoint - start )),
                bold: false,
                italic: false,
            }
        }
    }
    return null
}

export function containsFormattedUnicode(text: string): boolean {
    for (const ch of text) {
        const cp = ch.codePointAt(0)
        if (cp === undefined) continue
        if (classify(cp)) return true
    }
    return false
}

/**
 * LinkedIn's plain-text clipboard (and sometimes the href/text content of
 * its anchor tags) prefixes hashtag-link text with the literal word
 * "hashtag" — e.g. "hashtag#CustomsCompliance" instead of "#CustomsCompliance".
 * This strips that prefix so the pasted content reads as intended.
 */
export function stripHashtagPrefix(text: string): string {
    return text.replace(/hashtag#/gi, '#')
}

export function needsNormalization(text: string): boolean {
    return containsFormattedUnicode(text) || /hashtag#/i.test(text)
}

/**
 * Matches two <br> tags separated only by whitespace (spaces, tabs, newlines).
 * Pasted HTML from word processors and social posts often uses `<br><br>` as a
 * paragraph break instead of splitting into separate `<p>` elements — which
 * leaves the editor with one giant paragraph that's awkward to style and edit.
 * `[^>]*` covers attribute variants (`<br class="..."/>`, `<br data-x>`, etc.)
 * that LinkedIn and others emit.
 */
const DOUBLE_BR_PATTERN = /<br\b[^>]*>\s*<br\b[^>]*>/i

export function containsDoubleBr(html: string): boolean {
    return DOUBLE_BR_PATTERN.test(html)
}

/**
 * Matches a blank line in plain text — two or more newlines (optionally with
 * whitespace on the "blank" line). LinkedIn and similar apps deliver pasted
 * posts as `text/plain` with this shape, and we want to split those into
 * separate paragraphs rather than stuffing the literal newlines into a single
 * paragraph as text content.
 */
const DOUBLE_NEWLINE_PATTERN = /\n[\t ]*\n/

export function containsDoubleNewline(text: string): boolean {
    return DOUBLE_NEWLINE_PATTERN.test(text)
}

/**
 * Splits plain text on blank lines (two-or-more newlines, optionally with
 * spaces on the blank line) and trims each paragraph.
 */
export function splitPlainTextParagraphs(text: string): string[] {
    return text
        .split(/\n[\t ]*\n+/)
        .map(p => p.replace(/^\s+|\s+$/g, ''))
        .filter(p => p.length > 0)
}

/**
 * Splits `text` into runs of contiguous characters sharing the same format.
 * Plain ASCII runs keep bold=false/italic=false. Also strips LinkedIn's
 * "hashtag#" prefix artifact before tokenising.
 */
export function toFormattedRuns(text: string): FormattedRun[] {
    const normalized = stripHashtagPrefix(text)
    const runs: FormattedRun[] = []
    let current: FormattedRun | null = null

    const push = (ch: string, bold: boolean, italic: boolean) => {
        if (current && current.format.bold === bold && current.format.italic === italic) {
            current.text += ch
        } else {
            current = { text: ch, format: { bold, italic } }
            runs.push(current)
        }
    }

    for (const ch of normalized) {
        const cp = ch.codePointAt(0)
        if (cp === undefined) {
            push(ch, false, false)
            continue
        }
        const classified = classify(cp)
        if (classified) {
            push(classified.ascii, classified.bold, classified.italic)
        } else {
            push(ch, false, false)
        }
    }

    return runs
}
