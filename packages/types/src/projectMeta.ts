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
    /**
     * Parent domain the session cookie is scoped to, so one sign-in covers the CMS and the
     * preview host. Only set it when both are subdomains of it, otherwise the browser drops
     * the cookie and sign-in breaks. Ignored outside deployed environments, where the two
     * apps already share localhost.
     */
    cookieDomain?: string
    /** Must match the retention period this site's privacy policy states. Omit for the shared 24 month default. */
    messageRetentionMonths?: number
}
