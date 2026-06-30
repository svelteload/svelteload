import { convertLexicalToHTMLAsync } from '@payloadcms/richtext-lexical/html-async'
import { encodeMediaUrl } from './encodeMediaUrl'

const SIZE_WIDTHS = {
    thumbnail: 300,
    small:     480,
    medium:    768,
    large:     1200,
    huge:      1920,
    massive:   2560,
} as const

function escapeAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

function buildInlineUploadHTML(doc: any, alt: string): string {
    if (!doc) return ''
    const url: string = doc.url ?? ''
    const mimeType: string = doc.mimeType ?? ''

    if (!mimeType.startsWith('image')) {
        return `<a href="${escapeAttr(encodeMediaUrl(url))}" rel="noopener noreferrer">${escapeAttr(doc.filename ?? '')}</a>`
    }

    const isSvg = url.toLowerCase().endsWith('.svg')
    if (isSvg) {
        return `<img src="${escapeAttr(encodeMediaUrl(url))}" alt="${escapeAttr(alt)}" loading="lazy"/>`
    }

    const sizes = doc.sizes ?? {}
    const srcsetParts = Object.entries(SIZE_WIDTHS)
        .filter(([ name ]) => sizes[name]?.url)
        .map(([ name, width ]) => `${encodeMediaUrl(sizes[name].url)} ${width}w`)
    const srcset = srcsetParts.join(', ')

    const bestUrl = encodeMediaUrl(sizes.massive?.url ?? sizes.original?.url ?? url)
    const srcsetAttr = srcset ? ` srcset="${escapeAttr(srcset)}" sizes="(min-width: 1200px) 1200px, 100vw"` : ''

    return `<img src="${escapeAttr(bestUrl)}"${srcsetAttr} alt="${escapeAttr(alt)}" loading="lazy" class="inline-upload"/>`
}

function isLexicalRichText(obj: any): boolean {
    return (
        obj &&
        typeof obj === 'object' &&
        obj.root &&
        typeof obj.root === 'object' &&
        obj.root.type === 'root' &&
        Array.isArray(obj.root.children)
    )
}

function isEffectivelyEmpty(html: string): boolean {
    if (/<(img|picture|video|audio|iframe|embed|hr)\b/i.test(html)) return false
    const stripped = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').replace(/\s+/g, '')
    return stripped.length === 0
}

export async function convertLexicalFieldsToHTML(data: any): Promise<any> {
    if (!data) return data
    if (typeof data === 'string') return data

    if (isLexicalRichText(data)) {
        try {
            const html = await convertLexicalToHTMLAsync({
                data,
                converters: ({ defaultConverters }) => ({
                    ...defaultConverters,
                    upload: async ({ node, populate }: any) => {
                        let doc = node.value
                        if (typeof doc !== 'object' && populate) {
                            doc = await populate({ id: node.value, collectionSlug: node.relationTo })
                        }
                        if (!doc) return ''
                        const alt = node.fields?.alt || doc.alt || ''
                        return buildInlineUploadHTML(doc, alt)
                    },
                }),
            })
            return isEffectivelyEmpty(html) ? '' : html
        } catch (error) {
            console.error('Error converting Lexical to HTML:', error)
            return data
        }
    }

    if (Array.isArray(data)) {
        return Promise.all(data.map(item => convertLexicalFieldsToHTML(item)))
    }

    if (typeof data === 'object') {
        const converted: any = {}
        for (const [ key, value ] of Object.entries(data)) {
            converted[key] = await convertLexicalFieldsToHTML(value)
        }
        return converted
    }

    return data
}
