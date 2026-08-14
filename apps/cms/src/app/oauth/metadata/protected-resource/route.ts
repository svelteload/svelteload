import { protectedResourceMetadata } from '@cms/oauth/metadata'
import { preflight } from '@cms/oauth/config'

export const dynamic = 'force-dynamic'

export function OPTIONS(): Response {
    return preflight()
}

export function GET(request: Request): Response {
    return protectedResourceMetadata(request)
}
