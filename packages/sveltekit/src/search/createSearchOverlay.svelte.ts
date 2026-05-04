import { goto } from '$app/navigation'
import { searchQuery, type SearchResponse, type SearchResult } from './searchClient'
import { renderSnippet, stripMarkers } from './renderSnippet'
import { stashHighlight, stashHandoff } from './sessionState'

export interface SearchGroup {
    collection: string
    items: SearchResult[]
    total: number
}

export interface SearchOverlayController {
    isOpen: boolean
    seed: string
    query: string
    readonly response: SearchResponse | null
    readonly loading: boolean
    readonly grouped: SearchGroup[]
    inputEl: HTMLInputElement | null
    overlayEl: HTMLElement | null
    onInput(): void
    onSubmit(e: SubmitEvent): void
    onResultClick(result: SearchResult, e: MouseEvent): void
    close(): void
    buildSearchUrl(q: string): string
    renderSnippet(snippet: string): string
}

export interface CreateSearchOverlayOptions {
    searchPath?: string
    locale?: string
    debounceMs?: number
    overlayMax?: number
}

export function createSearchOverlay(opts: CreateSearchOverlayOptions = {}): SearchOverlayController {
    const debounceMs = opts.debounceMs ?? 150
    const overlayMax = opts.overlayMax ?? 5
    const getSearchPath = () => opts.searchPath ?? '/search'
    const getLocale = () => opts.locale

    let isOpen = $state(false)
    let seed = $state('')
    let query = $state('')
    let response = $state<SearchResponse | null>(null)
    let loading = $state(false)
    let inputEl = $state<HTMLInputElement | null>(null)
    let overlayEl = $state<HTMLElement | null>(null)

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let currentController: AbortController | null = null

    function buildSearchUrl(q: string): string {
        return `${getSearchPath()}?q=${encodeURIComponent(q)}`
    }

    function runSearch(q: string) {
        if (!q.trim()) {
            response = null
            loading = false
            return
        }
        if (currentController) currentController.abort()
        currentController = new AbortController()
        loading = true
        const controller = currentController
        searchQuery({ query: q, locale: getLocale(), limit: 20, signal: controller.signal })
            .then((res) => {
                if (controller.signal.aborted) return
                response = res
                loading = false
            })
            .catch((err) => {
                if ((err as Error).name === 'AbortError') return
                loading = false
                response = null
            })
    }

    function onInput() {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => runSearch(query), debounceMs)
    }

    function onResultClick(result: SearchResult, e: MouseEvent) {
        if (!result.url) {
            e.preventDefault()
            return
        }
        stashHighlight({ query, matchedText: stripMarkers(result.snippet) })
        isOpen = false
    }

    function onSubmit(e: SubmitEvent) {
        e.preventDefault()
        if (!query.trim()) return
        stashHandoff({ query })
        isOpen = false
        goto(buildSearchUrl(query))
    }

    function close() {
        isOpen = false
    }

    const grouped = $derived.by<SearchGroup[]>(() => {
        if (!response) return []
        const top = response.results.slice(0, overlayMax)
        const map = new Map<string, SearchResult[]>()
        for (const r of top) {
            const arr = map.get(r.collection) ?? []
            arr.push(r)
            map.set(r.collection, arr)
        }
        return Array.from(map.entries()).map(([collection, items]) => ({
            collection,
            items,
            total: response!.byCollection[collection] ?? items.length,
        }))
    })

    $effect(() => {
        if (isOpen) {
            if (seed) {
                query = seed
                seed = ''
                runSearch(query)
            }
            setTimeout(() => {
                inputEl?.focus()
                const len = inputEl?.value.length ?? 0
                inputEl?.setSelectionRange(len, len)
            }, 20)
        } else {
            query = ''
            response = null
            loading = false
            if (currentController) {
                currentController.abort()
                currentController = null
            }
        }
    })

    $effect(() => {
        if (!isOpen) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') isOpen = false
        }
        const onClick = (e: MouseEvent) => {
            if (!overlayEl) return
            if (!overlayEl.contains(e.target as Node)) isOpen = false
        }
        document.addEventListener('keydown', onKey)
        document.addEventListener('mousedown', onClick)
        return () => {
            document.removeEventListener('keydown', onKey)
            document.removeEventListener('mousedown', onClick)
        }
    })

    return {
        get isOpen() { return isOpen },
        set isOpen(v) { isOpen = v },
        get seed() { return seed },
        set seed(v) { seed = v },
        get query() { return query },
        set query(v) { query = v },
        get response() { return response },
        get loading() { return loading },
        get grouped() { return grouped },
        get inputEl() { return inputEl },
        set inputEl(v) { inputEl = v },
        get overlayEl() { return overlayEl },
        set overlayEl(v) { overlayEl = v },
        onInput,
        onSubmit,
        onResultClick,
        close,
        buildSearchUrl,
        renderSnippet,
    }
}
