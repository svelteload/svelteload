<script lang="ts">
    interface Props {
        icon: string
        size?: number
        strokeWidth?: number
        color?: string
    }

    let {
        icon,
        size = 24,
        strokeWidth = 2,
        color = 'currentColor',
    }: Props = $props()
</script>

{#if icon !== ''}
    <svg
        width={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        stroke-width={strokeWidth}
        stroke-linecap="round"
        stroke-linejoin="round"
    >
        {#if icon === 'file'}
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
        {:else if icon === 'search'}
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        {:else if icon === 'arrow-right'}
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
        {:else if icon === 'external-link'}
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
        {:else if icon === 'up'}
            <path d="M6 15L12 9L18 15"/>
        {:else if icon === 'down'}
            <path d="M6 9L12 15L18 9"/>
        {:else if icon === 'left'}
            <polyline points="15 18 9 12 15 6"/>
        {:else if icon === 'right'}
            <polyline points="9 18 15 12 9 6"/>
        {/if}
    </svg>
{/if}

<style>
    svg {
        display: flex;
        flex-shrink: 0;
    }
</style>
