'use client'

import { useLexicalComposerContext } from '@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext'
import { $generateNodesFromDOM } from '@payloadcms/richtext-lexical/lexical/html'
import {
    $createParagraphNode,
    $createTextNode,
    $getSelection,
    $isElementNode,
    $isLineBreakNode,
    $isRangeSelection,
    $isTextNode,
    COMMAND_PRIORITY_HIGH,
    PASTE_COMMAND,
    type ElementNode,
    type LexicalEditor,
    type LexicalNode,
} from '@payloadcms/richtext-lexical/lexical'
import { useEffect } from 'react'

import {
    containsDoubleBr,
    containsDoubleNewline,
    containsFormattedUnicode,
    needsNormalization,
    splitPlainTextParagraphs,
    stripHashtagPrefix,
    toFormattedRuns,
} from './transform'

const HASHTAG_ANCHOR_PATTERN = /hashtag\s*#/i

/**
 * LinkedIn renders hashtag links with an accessibility span —
 * `<a><span aria-hidden="true">hashtag</span>#Tag</a>` — so "hashtag" and
 * "#Tag" land in separate text nodes. Detect that pattern at the anchor
 * level and collapse the anchor's contents to a single cleaned text node.
 */
function cleanHashtagAnchors(root: HTMLElement): void {
    const anchors = root.querySelectorAll('a')
    for (const anchor of Array.from(anchors)) {
        const text = anchor.textContent ?? ''
        if (!HASHTAG_ANCHOR_PATTERN.test(text)) continue
        anchor.textContent = text.replace(/hashtag\s*#/gi, '#')
    }
}

function isWhitespaceOnly(node: Node): boolean {
    return node.nodeType === Node.TEXT_NODE && /^\s*$/.test(node.textContent ?? '')
}

function isBreakOrWhitespace(node: Node): boolean {
    return node.nodeName === 'BR' || isWhitespaceOnly(node)
}

function hasDoubleBrDirectChild(el: Element): boolean {
    const children = el.childNodes
    for (let i = 0; i < children.length - 1; i++) {
        if (children[i].nodeName !== 'BR') continue
        let j = i + 1
        while (j < children.length && isWhitespaceOnly(children[j])) j++
        if (j < children.length && children[j].nodeName === 'BR') return true
    }
    return false
}

// Inline wrappers that should be dissolved when they straddle a double-<br>,
// so the break is exposed to the nearest block ancestor for clean splitting.
// Anchors are intentionally excluded — unwrapping them would discard href.
const INLINE_UNWRAP_TAGS = new Set([
    'SPAN', 'EM', 'I', 'B', 'STRONG', 'U', 'FONT', 'SMALL', 'MARK', 'SUB', 'SUP',
])

function unwrapInlineAroundDoubleBr(root: HTMLElement): void {
    // Nested inline wrappers (LinkedIn loves these) can take several passes
    // to fully unwrap. The iteration cap is a safety net, not expected.
    for (let iteration = 0; iteration < 10; iteration++) {
        const victims = Array.from(root.querySelectorAll('*')).filter(
            el => INLINE_UNWRAP_TAGS.has(el.tagName) && hasDoubleBrDirectChild(el),
        )
        if (victims.length === 0) return
        for (const el of victims) {
            const parent = el.parentNode
            if (!parent) continue
            while (el.firstChild) parent.insertBefore(el.firstChild, el)
            parent.removeChild(el)
        }
    }
}

/**
 * Splits block elements on double-<br> boundaries. Two consecutive <br> tags
 * (separated only by whitespace) signal a paragraph break in pasted content
 * from word processors and social posts — but land as inline line breaks
 * unless the enclosing block is split.
 *
 * Runs after `unwrapInlineAroundDoubleBr` so inline wrappers don't prevent
 * the break from reaching a splittable ancestor. Processes innermost blocks
 * first so parent splits see an already-normalized subtree. When the break
 * is at the body root with no block ancestor, segments are wrapped in new
 * <p>s; otherwise the block is cloned (preserving tag + attributes).
 */
function splitParagraphsOnDoubleBr(root: HTMLElement, doc: Document): void {
    unwrapInlineAroundDoubleBr(root)

    const descendants = Array.from(root.querySelectorAll('*'))
        .filter(el => !INLINE_UNWRAP_TAGS.has(el.tagName))
        .reverse()
    const blocks: Element[] = [...descendants, root]

    for (const block of blocks) {
        if (!hasDoubleBrDirectChild(block)) continue

        const children = Array.from(block.childNodes)
        const segments: Node[][] = [[]]

        let i = 0
        while (i < children.length) {
            const node = children[i]
            if (node.nodeName === 'BR') {
                let j = i + 1
                while (j < children.length && isWhitespaceOnly(children[j])) j++
                if (j < children.length && children[j].nodeName === 'BR') {
                    segments.push([])
                    i = j + 1
                    continue
                }
            }
            segments[segments.length - 1].push(node)
            i++
        }

        for (const seg of segments) {
            while (seg.length > 0 && isBreakOrWhitespace(seg[0])) seg.shift()
            while (seg.length > 0 && isBreakOrWhitespace(seg[seg.length - 1])) seg.pop()
        }

        const nonEmpty = segments.filter(seg => seg.length > 0)
        if (nonEmpty.length <= 1) continue

        if (block === root) {
            while (root.firstChild) root.removeChild(root.firstChild)
            for (const seg of nonEmpty) {
                const p = doc.createElement('p')
                for (const node of seg) p.appendChild(node)
                root.appendChild(p)
            }
        } else {
            const fragment = doc.createDocumentFragment()
            for (const seg of nonEmpty) {
                const newBlock = block.cloneNode(false) as Element
                for (const node of seg) newBlock.appendChild(node)
                fragment.appendChild(newBlock)
            }
            block.parentNode?.replaceChild(fragment, block)
        }
    }
}

/**
 * Walks all text nodes beneath `root` and rewrites any that need
 * normalisation — either because they contain Unicode Mathematical
 * Alphanumeric "fake bold/italic" chars, or because they contain LinkedIn's
 * "hashtag#" prefix artifact. Formatted runs become <strong>/<em> wrapped
 * ASCII; the hashtag prefix is simply stripped. Surrounding structure
 * (links, paragraphs, etc.) is preserved.
 */
function rewriteInDom(root: HTMLElement, doc: Document): void {
    splitParagraphsOnDoubleBr(root, doc)
    cleanHashtagAnchors(root)

    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const targets: Text[] = []
    let current = walker.nextNode() as Text | null
    while (current) {
        if (needsNormalization(current.data)) targets.push(current)
        current = walker.nextNode() as Text | null
    }

    for (const textNode of targets) {
        if (containsFormattedUnicode(textNode.data)) {
            const runs = toFormattedRuns(textNode.data)
            const fragment = doc.createDocumentFragment()
            for (const run of runs) {
                let host: Node = doc.createTextNode(run.text)
                if (run.format.italic) {
                    const em = doc.createElement('em')
                    em.appendChild(host)
                    host = em
                }
                if (run.format.bold) {
                    const strong = doc.createElement('strong')
                    strong.appendChild(host)
                    host = strong
                }
                fragment.appendChild(host)
            }
            textNode.parentNode?.replaceChild(fragment, textNode)
        } else {
            textNode.data = stripHashtagPrefix(textNode.data)
        }
    }
}

function getClipboardTransfer(event: unknown): DataTransfer | null {
    if (event && typeof event === 'object') {
        if ('clipboardData' in event && event.clipboardData) {
            return event.clipboardData as DataTransfer
        }
        if ('dataTransfer' in event && event.dataTransfer) {
            return event.dataTransfer as DataTransfer
        }
    }
    return null
}

function isWhitespaceTextNode(node: LexicalNode | undefined): boolean {
    return !!node && $isTextNode(node) && /^\s*$/.test(node.getTextContent())
}

function isBreakOrWhitespaceNode(node: LexicalNode | undefined): boolean {
    return !!node && ($isLineBreakNode(node) || isWhitespaceTextNode(node))
}

/**
 * Looks for a paragraph-break boundary starting at index `i` in `children`:
 * a LineBreakNode, optionally followed by whitespace TextNodes, followed by
 * another LineBreakNode. Returns the index AFTER the boundary if one is
 * found, or -1 otherwise.
 */
function doubleLineBreakEnd(children: readonly LexicalNode[], i: number): number {
    if (!$isLineBreakNode(children[i])) return -1
    let j = i + 1
    while (j < children.length && isWhitespaceTextNode(children[j])) j++
    if (j < children.length && $isLineBreakNode(children[j])) return j + 1
    return -1
}

/**
 * Splits a ParagraphNode (or similar block) on double-LineBreak boundaries.
 * Returns an array of new block nodes, one per segment, or just [paragraph]
 * if no split is needed. Leading/trailing linebreaks and whitespace-only
 * text nodes are stripped from each segment.
 */
function splitBlockOnDoubleLineBreak(paragraph: ElementNode): ElementNode[] {
    const children = paragraph.getChildren()
    const groups: LexicalNode[][] = [[]]

    let i = 0
    while (i < children.length) {
        const end = doubleLineBreakEnd(children, i)
        if (end >= 0) {
            groups.push([])
            i = end
            continue
        }
        groups[groups.length - 1].push(children[i])
        i++
    }

    for (const g of groups) {
        while (g.length > 0 && isBreakOrWhitespaceNode(g[0])) g.shift()
        while (g.length > 0 && isBreakOrWhitespaceNode(g[g.length - 1])) g.pop()
    }
    const nonEmpty = groups.filter(g => g.length > 0)
    if (nonEmpty.length <= 1) return [paragraph]

    return nonEmpty.map(g => {
        const p = $createParagraphNode()
        for (const n of g) p.append(n)
        return p
    })
}

/**
 * Walks the flat node list returned by `$generateNodesFromDOM` and promotes
 * runs of inline nodes separated by double LineBreakNodes into separate
 * ParagraphNodes. Pre-existing block nodes are preserved (and also split
 * internally on double linebreaks). Leading/trailing linebreaks in each
 * group are dropped so the result has clean paragraph boundaries.
 *
 * This is the workhorse for LinkedIn-style pastes, where the source HTML is
 * a flat span + <br><br> structure that otherwise lands as one huge
 * paragraph full of linebreaks.
 */
function groupIntoParagraphs(nodes: LexicalNode[]): LexicalNode[] {
    const result: LexicalNode[] = []
    let buffer: LexicalNode[] = []

    const flush = () => {
        while (buffer.length > 0 && isBreakOrWhitespaceNode(buffer[0])) buffer.shift()
        while (buffer.length > 0 && isBreakOrWhitespaceNode(buffer[buffer.length - 1])) buffer.pop()
        if (buffer.length === 0) return
        const p = $createParagraphNode()
        for (const n of buffer) p.append(n)
        result.push(p)
        buffer = []
    }

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        if ($isElementNode(node) && !node.isInline()) {
            flush()
            for (const split of splitBlockOnDoubleLineBreak(node)) result.push(split)
            continue
        }
        const end = doubleLineBreakEnd(nodes, i)
        if (end >= 0) {
            flush()
            i = end - 1
            continue
        }
        buffer.push(node)
    }
    flush()
    return result
}

function handlePaste(event: ClipboardEvent, editor: LexicalEditor): boolean {
    const clipboardData = getClipboardTransfer(event)
    if (!clipboardData) return false

    const plainText = clipboardData.getData('text/plain')
    const html = clipboardData.getData('text/html')

    const plainNeeds = plainText
        ? (needsNormalization(plainText) || containsDoubleNewline(plainText))
        : false
    const htmlNeeds = html ? (needsNormalization(html) || containsDoubleBr(html)) : false
    if (!plainNeeds && !htmlNeeds) return false

    event.preventDefault()

    if (html) {
        const parser = new DOMParser()
        const dom = parser.parseFromString(html, 'text/html')
        rewriteInDom(dom.body, dom)

        editor.update(() => {
            const selection = $getSelection()
            if (!$isRangeSelection(selection)) return
            const rawNodes = $generateNodesFromDOM(editor, dom)
            const grouped = groupIntoParagraphs(rawNodes)
            selection.insertNodes(grouped)
        })
        return true
    }

    const paragraphs = splitPlainTextParagraphs(plainText)
    editor.update(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return

        if (paragraphs.length <= 1) {
            const runs = toFormattedRuns(plainText)
            const nodes = runs.map(run => {
                const node = $createTextNode(run.text)
                if (run.format.bold) node.toggleFormat('bold')
                if (run.format.italic) node.toggleFormat('italic')
                return node
            })
            selection.insertNodes(nodes)
            return
        }

        const paragraphNodes = paragraphs.map(paraText => {
            const runs = toFormattedRuns(paraText)
            const paragraph = $createParagraphNode()
            for (const run of runs) {
                const node = $createTextNode(run.text)
                if (run.format.bold) node.toggleFormat('bold')
                if (run.format.italic) node.toggleFormat('italic')
                paragraph.append(node)
            }
            return paragraph
        })
        selection.insertNodes(paragraphNodes)
    })

    return true
}

export function UnicodeFormattingPastePlugin(): null {
    const [ editor ] = useLexicalComposerContext()

    useEffect(() => {
        return editor.registerCommand<ClipboardEvent>(
            PASTE_COMMAND,
            event => handlePaste(event, editor),
            COMMAND_PRIORITY_HIGH,
        )
    }, [ editor ])

    return null
}
