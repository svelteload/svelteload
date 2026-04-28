import { getPayload, buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { payloadConfigBase } from 'payload-config/payload-base.config'
import { PAYLOAD_SECRET, POSTGRES_URL } from '$env/static/private'

let cachedConfig: ReturnType<typeof buildConfig> | null = null
let cachedPayload: any = null

export const getPayloadInstance = async () => {
    if (cachedPayload) return cachedPayload
    if (!cachedConfig) {
        cachedConfig = buildConfig({
            ...payloadConfigBase,
            secret: PAYLOAD_SECRET,
            db: postgresAdapter({
                pool: { connectionString: POSTGRES_URL },
                push: false,
            }),
        })
    }
    cachedPayload = await getPayload({ config: cachedConfig })
    return cachedPayload
}
