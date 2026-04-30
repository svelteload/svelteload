<script lang="ts">
    import type { Snippet } from 'svelte'

    interface Props {
        scrollY: number
        icon: Snippet
        liftSelector?: string | null
    }

    let { scrollY = $bindable(), icon, liftSelector = 'footer .legal-section' }: Props = $props()

    let viewportHeight = $state(0)
    let liftPx = $state(0)

    $effect(() => {
        scrollY
        viewportHeight
        if (viewportHeight === 0 || !liftSelector) {
            liftPx = 0
            return
        }
        const target = document.querySelector(liftSelector) as HTMLElement | null
        if (!target) {
            liftPx = 0
            return
        }
        const rect = target.getBoundingClientRect()
        liftPx = Math.max(0, viewportHeight - rect.top)
    })

    function scrollTop() {
        if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' })
        }
    }
</script>

<svelte:window bind:innerHeight={viewportHeight}/>

<button
    class="scroll-top"
    aria-label="Scroll Top"
    disabled={scrollY < 10}
    onclick={scrollTop}
    style:transform="translateY(-{liftPx}px)"
>
    <span class="scroll-top-icon">{@render icon()}</span>
</button>

<style>
    .scroll-top {
        position: fixed;
        bottom: 8px;
        right: 8px;
        width: 48px;
        height: 48px;
        background: var(--scroll-top-bg, #444);
        color: var(--scroll-top-fg, #ffffff);
        border-radius: var(--scroll-top-radius, 50%);
        border: none;
        cursor: pointer;
        display: flex;
        justify-content: center;
        align-items: center;
        transition: opacity 0.2s ease-in-out, transform 0.15s ease-out;
        z-index: 1000;
    }

    .scroll-top:disabled {
        opacity: 0;
        cursor: default;
    }

    .scroll-top-icon {
        transform: translateY(-2px);
    }
</style>
