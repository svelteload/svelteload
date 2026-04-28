import type { Config, Plugin, CollectionConfig, Field } from 'payload'
import { isAdminFieldAccess } from '@cms/access/roles'
import { previewUrlEndpoint } from './previewUrlEndpoint'

export const previewAuthPlugin = (): Plugin => (incomingConfig: Config): Config => {
  const authSlug = incomingConfig.admin?.user
  if (!authSlug) return incomingConfig

  const livePreviewCollections = new Set(
    incomingConfig.admin?.livePreview?.collections ?? [],
  )

  const accessLogsJoin: Field = {
    name: 'accessLogs',
    type: 'join',
    collection: 'access-logs',
    on: 'user',
    admin: {
      defaultColumns: ['eventType', 'createdAt', 'ip'],
      description: 'Recent CMS login/logout events for this user.',
    },
    access: {
      read: isAdminFieldAccess,
    },
  }

  const previewKeysJoin: Field = {
    name: 'previewKeys',
    type: 'join',
    collection: 'preview-keys',
    on: 'user',
    admin: {
      defaultColumns: ['token', 'createdAt', 'expiresAt', 'revoked'],
      description: 'Active and historical preview tokens for this user.',
    },
    access: {
      read: isAdminFieldAccess,
    },
  }

  const previewButtons = [
    '@cms/previewAuth/CopyPreviewUrlButton',
    '@cms/previewAuth/OpenPreviewSiteButton',
  ]

  const collections = incomingConfig.collections?.map((coll): CollectionConfig => {
    if (livePreviewCollections.has(coll.slug)) {
      const existingBefore = coll.admin?.components?.edit?.beforeDocumentControls ?? []
      const missing = previewButtons.filter(
        (path) => !existingBefore.some((c) => typeof c === 'string' && c === path),
      )
      if (missing.length === 0) return coll

      return {
        ...coll,
        admin: {
          ...coll.admin,
          components: {
            ...coll.admin?.components,
            edit: {
              ...coll.admin?.components?.edit,
              beforeDocumentControls: [
                ...existingBefore,
                ...missing,
              ],
            },
          },
        },
      }
    }

    if (coll.slug !== authSlug) return coll

    const hasAccessLogsJoin = coll.fields.some(
      (f) => 'name' in f && (f as { name?: string }).name === 'accessLogs',
    )
    const hasPreviewKeysJoin = coll.fields.some(
      (f) => 'name' in f && (f as { name?: string }).name === 'previewKeys',
    )

    const nextFields: Field[] = [...coll.fields]
    if (!hasAccessLogsJoin) nextFields.push(accessLogsJoin)
    if (!hasPreviewKeysJoin) nextFields.push(previewKeysJoin)

    return {
      ...coll,
      fields: nextFields,
      hooks: {
        ...coll.hooks,
        afterLogin: [
          ...(coll.hooks?.afterLogin ?? []),
          async ({ req, user }) => {
            await req.payload.create({
              collection: 'access-logs',
              data: {
                user: user.id,
                eventType: 'login',
                ip: extractIp(req),
                userAgent: req.headers?.get?.('user-agent') ?? undefined,
              } as any,
              overrideAccess: true,
              req,
            })
          },
        ],
        afterLogout: [
          ...(coll.hooks?.afterLogout ?? []),
          async ({ req }) => {
            if (!req.user) return
            await req.payload.create({
              collection: 'access-logs',
              data: {
                user: req.user.id,
                eventType: 'logout',
                ip: extractIp(req),
                userAgent: req.headers?.get?.('user-agent') ?? undefined,
              } as any,
              overrideAccess: true,
              req,
            })
          },
        ],
        beforeDelete: [
          ...(coll.hooks?.beforeDelete ?? []),
          async ({ req, id }) => {
            await req.payload.delete({
              collection: 'access-logs',
              where: { user: { equals: id } },
              overrideAccess: true,
              req,
            })
            await req.payload.delete({
              collection: 'preview-keys',
              where: { user: { equals: id } },
              overrideAccess: true,
              req,
            })
            await req.payload.delete({
              collection: 'payload-locked-documents',
              where: { 'user.value': { equals: id } },
              overrideAccess: true,
              req,
            })
          },
        ],
      },
    }
  })

  return {
    ...incomingConfig,
    collections,
    endpoints: [
      ...(incomingConfig.endpoints ?? []),
      previewUrlEndpoint,
    ],
  }
}

function extractIp(req: any): string | undefined {
  const forwarded = req.headers?.get?.('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers?.get?.('x-real-ip') ?? undefined
}
