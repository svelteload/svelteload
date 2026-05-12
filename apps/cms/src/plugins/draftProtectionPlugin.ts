import type { Config, Plugin } from 'payload'
import { APIError } from 'payload'
import { getUserRole } from '@cms/access/roles'

export const draftProtectionPlugin = (): Plugin => (incomingConfig: Config): Config => {
    const hasDrafts = (versions: any): boolean => {
        if (!versions) return false
        if (typeof versions === 'object' && versions.drafts) return true
        return false
    }

    const blockDraftOnlyPublish = async ({ args, operation, req }: any) => {
        if (!req.user) return args
        const role = getUserRole(req.user)
        if (role !== 'contributor' && role !== 'agent') return args
        if (operation !== 'update' && operation !== 'create') return args
        if (args?.data?._status !== 'published') return args
        const label = role === 'agent' ? 'Agents' : 'Contributors'
        throw new APIError(
            `${label} can only save drafts, publishing is not allowed.`,
            403,
            undefined,
            true,
        )
    }

    const publishButtonPath = '@cms/components/RolePublishButton#default'

    return {
        ...incomingConfig,
        collections: incomingConfig.collections?.map(collection => {
            if (!hasDrafts(collection.versions)) return collection
            return {
                ...collection,
                admin: {
                    ...collection.admin,
                    components: {
                        ...collection.admin?.components,
                        edit: {
                            ...collection.admin?.components?.edit,
                            PublishButton: publishButtonPath,
                        },
                    },
                },
                hooks: {
                    ...collection.hooks,
                    beforeOperation: [
                        blockDraftOnlyPublish,
                        ...(collection.hooks?.beforeOperation ?? []),
                    ],
                },
            }
        }),
        globals: incomingConfig.globals?.map(global => {
            if (!hasDrafts(global.versions)) return global
            return {
                ...global,
                admin: {
                    ...global.admin,
                    components: {
                        ...global.admin?.components,
                        elements: {
                            ...global.admin?.components?.elements,
                            PublishButton: publishButtonPath,
                        },
                    },
                },
                hooks: {
                    ...global.hooks,
                    beforeOperation: [
                        blockDraftOnlyPublish,
                        ...(global.hooks?.beforeOperation ?? []),
                    ],
                },
            }
        }),
    }
}
