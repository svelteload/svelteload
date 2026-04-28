<script lang="ts">
    import { beforeNavigate, afterNavigate } from '$app/navigation'

    let width = $state(0)
    let visible = $state(false)
    let fading = $state(false)
    let raf: number | null = null
    let fadeTimer: ReturnType<typeof setTimeout> | null = null

    function startProgress() {
        if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null }
        if (raf) { cancelAnimationFrame(raf); raf = null }

        fading = false
        visible = true
        width = 0

        const tick = () => {
            width += (85 - width) * 0.06
            if (width < 84.5) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
    }

    function completeProgress() {
        if (raf) { cancelAnimationFrame(raf); raf = null }

        width = 100
        fading = true

        fadeTimer = setTimeout(() => {
            visible = false
            width = 0
            fading = false
        }, 400)
    }

    beforeNavigate(startProgress)
    afterNavigate(completeProgress)
</script>

{#if visible}
    <div class="nav-progress" class:fading style:width="{width}%"></div>
{/if}

<style>
    .nav-progress {
        position: fixed;
        top: 0;
        left: 0;
        height: 2px;
        background: var(--nav-progress-color, #888);
        z-index: 9999;
        transition: width 0.1s linear, opacity 0.2s ease;
        pointer-events: none;
        opacity: 1;
    }

    .nav-progress.fading {
        opacity: 0;
        transition: width 0.05s linear, opacity 0.35s ease;
    }
</style>
