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
        {#if icon === 'search'}
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        {:else if icon === 'close'}
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
        {:else if icon === 'external-link'}
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
        {/if}
    </svg>
{/if}

<style>
    svg {
        display: flex;
        flex-shrink: 0;
    }
</style>
