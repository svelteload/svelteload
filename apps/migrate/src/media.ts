/**
 * Bringing the pictures across.
 *
 * Rewriting the markup to keep pointing at the old site would work on the day of the move and break
 * on the day the old project is deleted, quietly, one image at a time. So every file is fetched,
 * uploaded to nodebrush-app, and the markup is repointed at the token that comes back.
 *
 * A Svelteload site serves the same picture at six widths through a srcset. Only the largest is
 * fetched, because the app builds its own ladder from whatever it is given and re-uploading five
 * downscales of the same image would be five files it then downscales again.
 */

export interface UploadedImage {
    /** Every URL the old site used for this picture, including each srcset width. */
    sources: string[]
    url: string
}

const MAX_BYTES = 20 * 1024 * 1024

/**
 * The pictures a page references, one entry per underlying file. A srcset is many URLs for one
 * image, and the widths differ only in a query string or a path segment, so they are grouped by what
 * is left when the size is taken out.
 */
export function groupSources(urls: string[]): Map<string, string[]> {
    const groups = new Map<string, string[]>()

    for (const url of urls) {
        if (!url || url.startsWith('data:')) continue
        const key = url
            .replace(/[?&](w|width|q|quality|fm|format)=[^&]*/g, '')
            .replace(/-\d{2,4}x\d{2,4}(?=\.[a-z0-9]+$)/i, '')
            .replace(/@\d+x(?=\.[a-z0-9]+$)/i, '')
        groups.set(key, [...(groups.get(key) ?? []), url])
    }

    return groups
}

function widest(urls: string[]): string {
    return [...urls].sort((a, b) => width(b) - width(a))[0]
}

function width(url: string): number {
    return Number(url.match(/[?&](?:w|width)=(\d+)/)?.[1] ?? url.match(/-(\d{3,4})x\d{3,4}\./)?.[1] ?? 0)
}

export async function carryImages(
    urls: string[],
    app: string,
    token: string,
    siteId: string | null,
    log: (line: string) => void,
): Promise<UploadedImage[]> {
    const carried: UploadedImage[] = []

    for (const [, sources] of groupSources(urls)) {
        const from = widest(sources)

        try {
            const response = await fetch(from)
            if (!response.ok) {
                log(`  could not fetch ${from}`)
                continue
            }

            const bytes = new Uint8Array(await response.arrayBuffer())
            if (bytes.byteLength > MAX_BYTES) {
                log(`  ${from} is larger than the upload limit`)
                continue
            }

            const form = new FormData()
            if (siteId) form.append('siteId', siteId)
            form.append(
                'file',
                new File([bytes], filenameOf(from), {
                    type: response.headers.get('content-type') ?? 'application/octet-stream',
                }),
            )

            const uploaded = await fetch(`${app}/api/assets`, {
                method: 'POST',
                headers: { authorization: `Bearer ${token}` },
                body: form,
            })

            if (!uploaded.ok) {
                log(`  the app refused ${from}`)
                continue
            }

            const { asset } = (await uploaded.json()) as { asset: { url: string } }
            carried.push({ sources, url: asset.url })
        } catch (error) {
            log(`  ${from}: ${(error as Error).message}`)
        }
    }

    return carried
}

function filenameOf(url: string): string {
    const name = decodeURIComponent(new URL(url, 'https://x').pathname.split('/').pop() ?? 'image')
    return /\.[a-z0-9]{2,5}$/i.test(name) ? name.slice(0, 120) : `${name.slice(0, 110)}.jpg`
}

/**
 * The markup, pointed at what was uploaded. A srcset is dropped entirely rather than rewritten: the
 * app writes its own from the ladder it built, and leaving the old one would keep every page asking
 * the previous host for images.
 */
export function repoint(html: string, carried: UploadedImage[]): string {
    let out = html

    for (const image of carried) {
        for (const source of image.sources) {
            out = out.replaceAll(source, image.url)
        }
    }

    return out
        .replace(/\s+srcset\s*=\s*"[^"]*"/gi, '')
        .replace(/\s+sizes\s*=\s*"[^"]*"/gi, '')
}
