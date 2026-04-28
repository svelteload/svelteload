export function cleanLexicalContent(content: any): void {
    if (!content?.root) return
    function walk(node: any): void {
        if (!node) return
        if (typeof node.text === 'string') {
            let text = node.text.normalize('NFKC')
            text = text.replace(/�/g, '')
            node.text = text
        }
        if (Array.isArray(node.children)) {
            for (const child of node.children) walk(child)
        }
    }
    walk(content.root)
}

export function extractPlainTextFromLexical(content: any): string {
    if (!content?.root) return ''

    const lines: string[] = []

    function walkInline(node: any): string {
        if (!node) return ''
        if (typeof node.text === 'string') return node.text
        if (Array.isArray(node.children)) {
            return node.children.map(walkInline).join('')
        }
        return ''
    }

    function walkBlock(node: any): void {
        if (!node) return
        if (Array.isArray(node.children) && node.children.length > 0 && node.children[0]?.type !== 'text' && node.type !== 'paragraph' && node.type !== 'heading' && node.type !== 'quote' && node.type !== 'listitem') {
            for (const child of node.children) walkBlock(child)
            return
        }
        const text = walkInline(node).trim()
        if (text) lines.push(text)
    }

    for (const child of content.root.children ?? []) {
        walkBlock(child)
    }

    return lines.join('\n')
}
