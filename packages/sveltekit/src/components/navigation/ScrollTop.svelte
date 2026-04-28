<script lang="ts">
    import Icons from '../ui/Icons.svelte'

    interface Props {
        scrollY: number
    }

    let { scrollY = $bindable() }: Props = $props()

    let viewportHeight = $state(0)
    let liftPx = $state(0)

    /**
     * Lift the button up if the page footer's legal section enters the
     * viewport, so it doesn't overlap. Selector matches both ECSA's and
     * nodebrush-website's footer markup. Projects whose footer doesn't
     * have this element get liftPx=0 (no lift, button stays bottom-right).
     */
    $effect(() => {
        scrollY
        viewportHeight
        if (viewportHeight === 0) return
        const legal = document.querySelector('footer .legal-section') as HTMLElement | null
        if (!legal) {
            liftPx = 0
            return
        }
        const rect = legal.getBoundingClientRect()
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
    <span class="scroll-top-icon"><Icons icon="up" size={36}/></span>
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
