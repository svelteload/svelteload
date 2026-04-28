import { getPayload, buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { payloadConfigBase } from 'payload-config/payload-base.config'
import { PAYLOAD_SECRET, POSTGRES_URL } from '$env/static/private'

let cachedConfig: ReturnType<typeof buildConfig> | null = null
let cachedPayload: any = null

/**
 * Returns a process-singleton Payload instance, built from the project's
 * `payload-config/payload-base.config` plus PAYLOAD_SECRET + POSTGRES_URL
 * read via SvelteKit's `$env/static/private`. Every project's payload-config
 * exports a base config under the same workspace package name, so this
 * import resolves correctly in any project that mounts the svelteload
 * submodule.
 */
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
