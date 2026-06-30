<script lang="ts">
    import { IMAGE_SRCSET_WIDTHS, type SrcsetSizeName } from '@svelteload/payload/imageSizes'
    import { encodeMediaUrl } from '../../utils/encodeMediaUrl'

    type PayloadImage = {
        url: string
        alt?: string
        sizes?: Partial<Record<SrcsetSizeName | 'original' | 'portrait_small' | 'portrait_medium', { url: string }>>
    }

    let {
        image,
        maxWidth,
        sizes: sizesProp,
        portrait = false,
        style,
        class: className = '',
        loading = 'lazy',
        fetchpriority,
    }: {
        image: PayloadImage
        maxWidth?: number
        sizes?: string
        portrait?: boolean
        style?: string
        class?: string
        loading?: 'lazy' | 'eager'
        fetchpriority?: 'high' | 'low' | 'auto'
    } = $props()

    const hasPortraitVariants = $derived(
        portrait && (!!image?.sizes?.portrait_small?.url || !!image?.sizes?.portrait_medium?.url),
    )

    function getNextSizeName(maxWidthInner: number): SrcsetSizeName {
        const entries = Object.entries(IMAGE_SRCSET_WIDTHS) as [SrcsetSizeName, number][]
        const entry = entries.find(e => e[1] >= maxWidthInner)
        return entry ? entry[0] : 'massive'
    }

    function getSrcset(): string {
        if (!image?.sizes) return ''
        let entries = Object.entries(IMAGE_SRCSET_WIDTHS) as [SrcsetSizeName, number][]
        if (maxWidth) {
            const cutoff = IMAGE_SRCSET_WIDTHS[getNextSizeName(maxWidth)]
            entries = entries.filter(e => e[1] <= cutoff)
        }
        return entries
            .filter(e => image.sizes?.[e[0]]?.url)
            .map(e => `${encodeMediaUrl(image.sizes![e[0]]!.url)} ${e[1]}w`)
            .join(', ')
    }

    function getBestUrl(): string {
        if (!image) return ''
        return encodeMediaUrl(
            image.sizes?.massive?.url
                ?? image.sizes?.original?.url
                ?? image.url,
        )
    }

    const isSvg = $derived(image?.url?.toLowerCase().endsWith('.svg') ?? false)
    const computedSizes = $derived(sizesProp ?? (maxWidth ? `${maxWidth}px` : '100vw'))
    const portraitSrcset = $derived(
        [
            image?.sizes?.portrait_small?.url ? `${encodeMediaUrl(image.sizes.portrait_small.url)} 480w` : '',
            image?.sizes?.portrait_medium?.url ? `${encodeMediaUrl(image.sizes.portrait_medium.url)} 768w` : '',
        ].filter(Boolean).join(', '),
    )
</script>

<picture style="display:contents">
    {#if !isSvg && hasPortraitVariants}
        <source
            media="(orientation: portrait) and (max-width: 560px)"
            srcset={portraitSrcset}
            sizes="100vw"
        />
    {/if}
    {#key image?.url}
        <img
            src={isSvg ? encodeMediaUrl(image.url) : getBestUrl()}
            srcset={isSvg ? undefined : getSrcset()}
            sizes={isSvg ? undefined : computedSizes}
            alt={image?.alt ?? ''}
            {loading}
            {fetchpriority}
            {style}
            class={className}
        />
    {/key}
</picture>
