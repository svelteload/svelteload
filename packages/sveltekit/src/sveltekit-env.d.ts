declare module '$env/static/private' {
    export const PAYLOAD_SECRET: string
    export const POSTGRES_URL: string
    export const LETTERMINT_API_KEY: string
    export const GOOGLE_CLOUD_PROJECT_ID: string
    export const GOOGLE_CLOUD_CLIENT_EMAIL: string
    export const GOOGLE_CLOUD_PRIVATE_KEY: string
    export const RECAPTCHA_SITE_KEY: string
    export const DISCORD_WEBHOOK_URL: string
    export const CRON_SECRET: string
    export const VERCEL_ENV: string
}

declare module '$env/static/public' {
    export const PUBLIC_SITE_URL: string
    export const PUBLIC_PREVIEW_URL: string
    export const PUBLIC_PAYLOAD_ADMIN_URL: string
}

declare namespace App {
    interface Error {
        page?: any
    }
    interface Locals {
        isPreview: boolean
        isInIframe: boolean
    }
}

interface Window {
    umami?: {
        track: (eventName: string, eventData?: Record<string, unknown>) => void
    }
}
