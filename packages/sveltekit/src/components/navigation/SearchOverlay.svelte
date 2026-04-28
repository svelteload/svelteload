<script lang="ts">
    import { goto } from '$app/navigation'
    import Icons from '../ui/Icons.svelte'
    import { searchQuery, type SearchResponse, type SearchResult } from '../../search/searchClient'
    import { renderSnippet, stripMarkers } from '../../search/renderSnippet'
    import { stashHighlight, stashHandoff } from '../../search/sessionState'

    let { isOpen = $bindable(false), seed = $bindable('') }: { isOpen?: boolean; seed?: string } = $props()

    let query = $state('')
    let response = $state<SearchResponse | null>(null)
    let loading = $state(false)
    let inputEl: HTMLInputElement | null = $state(null)
    let overlayEl: HTMLDivElement | null = $state(null)
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let currentController: AbortController | null = null

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
        searchQuery({ query: q, limit: 20, signal: controller.signal })
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
        debounceTimer = setTimeout(() => runSearch(query), 150)
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
        goto('/search')
    }

    const OVERLAY_MAX = 5

    const grouped = $derived.by(() => {
        if (!response) return []
        const top = response.results.slice(0, OVERLAY_MAX)
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
</script>

<div
    id="site-search-overlay"
    class="search-overlay"
    class:visible={isOpen}
    bind:this={overlayEl}
    role="dialog"
    aria-label="Search"
>
    <form class="search-form" onsubmit={onSubmit}>
        <span class="search-icon" aria-hidden="true">
            <Icons icon="search" size={18}/>
        </span>
        <input
            bind:this={inputEl}
            bind:value={query}
            oninput={onInput}
            type="search"
            placeholder="Search…"
            autocomplete="off"
            spellcheck="false"
        />
        {#if loading}
            <span class="search-loading"></span>
        {/if}
        <button
            type="button"
            class="search-close"
            onclick={() => (isOpen = false)}
            aria-label="Close search"
        >
            <Icons icon="close" size={16}/>
        </button>
    </form>

    {#if response && query.trim()}
        <div class="search-results">
            {#if response.results.length === 0}
                <div class="empty">No results for "{query}"</div>
            {:else}
                {#each grouped as group}
                    <div class="group">
                        <div class="group-heading">
                            <span class="group-name">{group.collection}</span>
                            <span class="group-count">{group.total}</span>
                        </div>
                        {#each group.items as r}
                            <a
                                class="result"
                                href={r.url ?? '#'}
                                onclick={(e) => onResultClick(r, e)}
                            >
                                <div class="result-title">{r.title || '(untitled)'}</div>
                                {#if r.snippet}
                                    <div class="result-snippet">{@html renderSnippet(r.snippet)}</div>
                                {/if}
                            </a>
                        {/each}
                    </div>
                {/each}
                <button type="button" class="see-all" onclick={() => { stashHandoff({ query }); isOpen = false; goto('/search') }}>
                    See all {response.totalHits} results →
                </button>
            {/if}
        </div>
    {/if}
</div>

<style>
    .search-overlay {
        position: fixed;
        top: var(--search-overlay-top, 82px);
        left: 50%;
        transform: translateX(-50%) translateY(-8px);
        width: calc(100vw - 32px);
        max-width: 560px;
        z-index: 19;
        background: var(--search-overlay-bg, #ffffff);
        border: 1px solid var(--accent-soft, #f4eef8);
        border-radius: var(--border-radius, 6px);
        box-shadow: var(--block-shadow, 0 0 16px 0 rgba(0, 0, 0, 0.14));
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
        font-family: var(--font, sans-serif);
    }

    @media only screen and (max-width: 1140px) {
        .search-overlay {
            top: var(--search-overlay-top-mobile, 72px);
        }
    }

    .search-overlay.visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
        visibility: visible;
        pointer-events: auto;
    }

    .search-form {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 14px;
        border-bottom: 1px solid var(--accent-soft, #f4eef8);
    }

    .search-icon {
        display: flex;
        align-items: center;
        color: var(--accent, #693e90);
    }

    .search-form input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        color: var(--text, #000000);
        font-size: 15px;
        font-family: var(--font, sans-serif);
        font-weight: 500;
        padding: 4px 0;
    }

    .search-form input::placeholder {
        color: #888;
    }

    .search-form input::-webkit-search-cancel-button,
    .search-form input::-webkit-search-decoration {
        -webkit-appearance: none;
        appearance: none;
    }

    .search-loading {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 2px solid var(--accent-soft, #f4eef8);
        border-top-color: var(--accent, #693e90);
        animation: spin 0.8s linear infinite;
    }

    .search-close {
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        color: var(--accent, #693e90);
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        transition: background 0.2s ease;
    }

    .search-close:hover {
        background: var(--accent-soft, #f4eef8);
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .search-results {
        max-height: calc(100vh - 160px);
        overflow-y: auto;
        padding: 8px 0;
    }

    .empty {
        padding: 24px;
        text-align: center;
        color: #666;
        font-size: 14px;
    }

    .group {
        padding: 4px 0 8px;
    }

    .group-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 16px 4px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--accent, #693e90);
    }

    .group-count {
        background: var(--accent-soft, #f4eef8);
        color: var(--accent-strong, #3a1768);
        padding: 1px 8px;
        border-radius: 8px;
        font-weight: 700;
    }

    .result {
        display: block;
        padding: 10px 16px;
        text-decoration: none;
        color: inherit;
        transition: background 0.2s ease;
        border-left: 2px solid transparent;
    }

    .result:hover {
        background: var(--accent-soft, #f4eef8);
        border-left-color: var(--accent, #693e90);
    }

    .result-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--text, #000000);
        margin-bottom: 2px;
    }

    .result-snippet {
        font-size: 12px;
        color: #555;
        line-height: 1.5;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
    }

    .result-snippet :global(.search-hit-inline) {
        background: var(--accent-highlight, #ccaaf9);
        color: var(--accent-strong, #3a1768);
        padding: 0 2px;
        border-radius: 2px;
    }

    .see-all {
        display: block;
        width: 100%;
        text-align: center;
        padding: 12px;
        margin-top: 4px;
        background: transparent;
        border: none;
        border-top: 1px solid var(--accent-soft, #f4eef8);
        color: var(--accent, #693e90);
        font-size: 13px;
        font-weight: 600;
        font-family: var(--font, sans-serif);
        cursor: pointer;
        transition: background 0.2s ease;
    }

    .see-all:hover {
        background: var(--accent-soft, #f4eef8);
    }
</style>
