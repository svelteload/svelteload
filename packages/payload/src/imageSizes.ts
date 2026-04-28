import type { ImageSize } from 'payload'

export const BASE_IMAGE_SIZES: ImageSize[] = [
    { name: 'thumbnail', width: 300, formatOptions: { format: 'webp', options: { quality: 75 } } },
    { name: 'small', width: 480, formatOptions: { format: 'webp', options: { quality: 75 } } },
    { name: 'medium', width: 768, formatOptions: { format: 'webp', options: { quality: 75 } } },
    { name: 'large', width: 1200, formatOptions: { format: 'webp', options: { quality: 75 } } },
    { name: 'huge', width: 1920, formatOptions: { format: 'webp', options: { quality: 75 } } },
    { name: 'massive', width: 2560, formatOptions: { format: 'webp', options: { quality: 75 } } },
    { name: 'original', formatOptions: { format: 'webp', options: { quality: 75 } } },
    { name: 'portrait_small', width: 480, height: 854, position: 'centre', formatOptions: { format: 'webp', options: { quality: 75 } } },
    { name: 'portrait_medium', width: 768, height: 1024, position: 'centre', formatOptions: { format: 'webp', options: { quality: 75 } } },
]

export const IMAGE_SRCSET_WIDTHS = {
    thumbnail: 300,
    small: 480,
    medium: 768,
    large: 1200,
    huge: 1920,
    massive: 2560,
} as const

export type SrcsetSizeName = keyof typeof IMAGE_SRCSET_WIDTHS
