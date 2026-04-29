import type { Config, Plugin } from 'payload'
import {
  createAfterChangeHook,
  createAfterDeleteHook,
  SYSTEM_COLLECTIONS,
} from './hooks'
import { backfillSearchUrlsEndpoint, reindexSearchEndpoint } from './endpoint'

export interface SearchPluginOptions {
  extraSkipKeys?: string[]
}

export const searchPlugin = (options: SearchPluginOptions = {}): Plugin => (incomingConfig: Config): Config => {
  const extraSkipKeys = options.extraSkipKeys ?? []
  const collections = incomingConfig.collections?.map((coll) => {
    if (SYSTEM_COLLECTIONS.has(coll.slug)) return coll
    return {
      ...coll,
      hooks: {
        ...coll.hooks,
        afterChange: [
          ...(coll.hooks?.afterChange ?? []),
          createAfterChangeHook(coll.slug, { extraSkipKeys }),
        ],
        afterDelete: [
          ...(coll.hooks?.afterDelete ?? []),
          createAfterDeleteHook(coll.slug),
        ],
      },
    }
  })

  return {
    ...incomingConfig,
    collections,
    endpoints: [
      ...(incomingConfig.endpoints ?? []),
      reindexSearchEndpoint({ extraSkipKeys }),
      backfillSearchUrlsEndpoint,
    ],
  }
}
