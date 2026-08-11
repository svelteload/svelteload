import type { ImageSize } from 'payload'

export type ProjectMeta = {
    cmsName: string
    brandName: string
    mediaUrlBase: string
    additionalImageSizes: ImageSize[]
    pageTypes: string[]
    localeBypassPaths?: string[]
    gatekeeper?: { bg?: string; fg?: string }
    cookiePrefix?: string
    /** Must match the retention period this site's privacy policy states. Omit for the shared 24 month default. */
    messageRetentionMonths?: number
}
