import { getPayload, buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { payloadConfigBase } from 'payload-config/payload-base.config'

const config = buildConfig({
    ...payloadConfigBase,
    secret: process.env.PAYLOAD_SECRET ?? '',
    db: postgresAdapter({
        pool: { connectionString: process.env.POSTGRES_URL ?? '' },
        push: false,
    }),
})

let cachedPayload: any = null

export const getPayloadInstance = async () => {
    if (cachedPayload) return cachedPayload
    cachedPayload = await getPayload({ config })
    return cachedPayload
}
