<script lang="ts">
    let { editUrl }: { editUrl: string | null } = $props()
</script>

<div class="preview-banner">
    <span>Previewing draft</span>
    {#if editUrl}
        <a href={editUrl} target="_blank" rel="noopener">
            Edit
            <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M9 2h5v5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M14 2 7.5 8.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M12 9v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </a>
    {/if}
</div>

<style>
    .preview-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 20px;
        z-index: 1000;
        display: flex;
        align-items: stretch;
        justify-content: space-between;
        gap: 12px;
        padding: 0 12px;
        background: var(--preview-banner-bg, #3a1768);
        color: var(--preview-banner-fg, #ffffff);
        font-family: var(--font, sans-serif);
        font-weight: 400;
        font-size: 11px;
        line-height: 1;
        box-sizing: border-box;
    }

    .preview-banner span,
    .preview-banner a {
        display: inline-flex;
        align-items: center;
        height: 100%;
        padding: 0 4px;
    }

    .preview-banner a {
        gap: 4px;
        color: inherit;
        text-decoration: none;
    }

    .preview-banner a:hover {
        text-decoration: underline;
    }

    .preview-banner svg {
        width: 11px;
        height: 11px;
    }
</style>
