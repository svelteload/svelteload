type LexicalNode = Record<string, any>

const BOLD = 1
const ITALIC = 2

const textNode = (text: string, format = 0): LexicalNode => ({
    detail: 0,
    format,
    mode: 'normal',
    style: '',
    text,
    type: 'text',
    version: 1,
})

const inlineFrom = (source: string): LexicalNode[] => {
    const nodes: LexicalNode[] = []
    const pattern = /(\*\*(?=\S)([\s\S]*?\S)\*\*|\*(?=\S)([\s\S]*?\S)\*)/g

    let cursor = 0
    let match: RegExpExecArray | null

    while ((match = pattern.exec(source)) !== null) {
        if (match.index > cursor) nodes.push(textNode(source.slice(cursor, match.index)))
        if (match[2] !== undefined) nodes.push(textNode(match[2], BOLD))
        else if (match[3] !== undefined) nodes.push(textNode(match[3], ITALIC))
        cursor = match.index + match[0].length
    }

    if (cursor < source.length) nodes.push(textNode(source.slice(cursor)))
    return nodes.length ? nodes : [textNode(source)]
}

const blockDefaults = { direction: 'ltr', format: '', indent: 0, version: 1 }

const paragraph = (source: string): LexicalNode => ({
    ...blockDefaults,
    type: 'paragraph',
    textFormat: 0,
    textStyle: '',
    children: inlineFrom(source),
})

const heading = (source: string, tag: string): LexicalNode => ({
    ...blockDefaults,
    type: 'heading',
    tag,
    children: inlineFrom(source),
})

const quote = (source: string): LexicalNode => ({
    ...blockDefaults,
    type: 'quote',
    children: inlineFrom(source),
})

const list = (items: string[], ordered: boolean): LexicalNode => ({
    ...blockDefaults,
    type: 'list',
    listType: ordered ? 'number' : 'bullet',
    tag: ordered ? 'ol' : 'ul',
    start: 1,
    children: items.map((item, index) => ({
        ...blockDefaults,
        type: 'listitem',
        value: index + 1,
        children: inlineFrom(item),
    })),
})

export const markdownToLexical = (source: string): LexicalNode => {
    const lines = String(source ?? '').replace(/\r\n/g, '\n').split('\n')
    const children: LexicalNode[] = []

    let paragraphBuffer: string[] = []
    let listBuffer: string[] = []
    let listOrdered = false

    const flushParagraph = () => {
        if (!paragraphBuffer.length) return
        children.push(paragraph(paragraphBuffer.join(' ').trim()))
        paragraphBuffer = []
    }

    const flushList = () => {
        if (!listBuffer.length) return
        children.push(list(listBuffer, listOrdered))
        listBuffer = []
    }

    for (const raw of lines) {
        const line = raw.trim()

        if (!line) {
            flushParagraph()
            flushList()
            continue
        }

        const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line)
        if (headingMatch) {
            flushParagraph()
            flushList()
            const level = Math.min(Math.max(headingMatch[1].length, 2), 6)
            children.push(heading(headingMatch[2], `h${level}`))
            continue
        }

        const bulletMatch = /^[-*+]\s+(.*)$/.exec(line)
        if (bulletMatch) {
            flushParagraph()
            if (listBuffer.length && listOrdered) flushList()
            listOrdered = false
            listBuffer.push(bulletMatch[1])
            continue
        }

        const orderedMatch = /^\d+[.)]\s+(.*)$/.exec(line)
        if (orderedMatch) {
            flushParagraph()
            if (listBuffer.length && !listOrdered) flushList()
            listOrdered = true
            listBuffer.push(orderedMatch[1])
            continue
        }

        const quoteMatch = /^>\s+(.*)$/.exec(line)
        if (quoteMatch) {
            flushParagraph()
            flushList()
            children.push(quote(quoteMatch[1]))
            continue
        }

        flushList()
        paragraphBuffer.push(line)
    }

    flushParagraph()
    flushList()

    if (!children.length) children.push(paragraph(''))

    return { root: { ...blockDefaults, type: 'root', children } }
}

export const lexicalToMarkdown = (content: any): string => {
    if (!content?.root?.children) return ''

    const inline = (node: any): string => {
        if (!node) return ''
        if (typeof node.text === 'string') {
            const format = typeof node.format === 'number' ? node.format : 0
            let text = node.text
            if (format & BOLD) text = `**${text}**`
            if (format & ITALIC) text = `*${text}*`
            return text
        }
        if (Array.isArray(node.children)) return node.children.map(inline).join('')
        return ''
    }

    const blocks: string[] = []

    const render = (node: any): void => {
        if (!node) return

        switch (node.type) {
            case 'heading': {
                const level = Number(String(node.tag ?? 'h2').replace('h', '')) || 2
                blocks.push(`${'#'.repeat(level)} ${inline(node).trim()}`)
                return
            }
            case 'quote':
                blocks.push(`> ${inline(node).trim()}`)
                return
            case 'list': {
                const ordered = node.listType === 'number'
                const items = (node.children ?? []).map((item: any, index: number) =>
                    ordered ? `${index + 1}. ${inline(item).trim()}` : `- ${inline(item).trim()}`,
                )
                if (items.length) blocks.push(items.join('\n'))
                return
            }
            case 'paragraph': {
                const text = inline(node).trim()
                if (text) blocks.push(text)
                return
            }
            case 'upload':
            case 'block':
            case 'relationship':
                blocks.push(`[${node.type} node, not editable as text]`)
                return
            default: {
                if (Array.isArray(node.children)) {
                    for (const child of node.children) render(child)
                    return
                }
                const text = inline(node).trim()
                if (text) blocks.push(text)
            }
        }
    }

    for (const child of content.root.children) render(child)

    return blocks.join('\n\n')
}

export const lexicalContainsUneditableNodes = (content: any): boolean => {
    if (!content?.root?.children) return false
    const uneditable = new Set(['upload', 'block', 'relationship'])
    let found = false
    const walk = (node: any): void => {
        if (!node || found) return
        if (uneditable.has(node.type)) {
            found = true
            return
        }
        if (Array.isArray(node.children)) for (const child of node.children) walk(child)
    }
    for (const child of content.root.children) walk(child)
    return found
}
