import type { Config, Plugin } from 'payload'
import { ContentReviewNotes } from '@cms/collections/ContentReviewNotes'
import { draftProtectionPlugin } from '@cms/plugins/draftProtectionPlugin'
import { searchPlugin } from '@cms/plugins/searchPlugin'
import { invitesPlugin } from '@cms/invites/plugin'
import { previewAuthPlugin } from '@cms/previewAuth/plugin'
import { lettermintEmail } from '@cms/email/lettermintEmail'

export interface PayloadAdminPluginOptions {
  search?: boolean
  searchSkipKeys?: string[]
  email?: {
    fromAddress: string
    fromName: string
  } | false
  invites?: boolean
  /**
   * Extra collection slugs to exclude from the Quick Switcher hover-list nav.
   * Merged with a built-in list of collections shared across all svelteload
   * projects that don't benefit from a flat name-only switcher.
   */
  docSwitcherExclude?: string[]
}

const DOC_SWITCHER_BASE_EXCLUDE = [
  'messages',
  'preview-keys',
  'access-logs',
  'media',
  'content-review-notes',
]

export function payloadAdminPlugin(options: PayloadAdminPluginOptions = {}): Plugin {
  const { search = true, searchSkipKeys, email, invites = true, docSwitcherExclude = [] } = options
  const excludedSlugs = Array.from(new Set([...DOC_SWITCHER_BASE_EXCLUDE, ...docSwitcherExclude]))
  return async (config: Config): Promise<Config> => {
    let result = await draftProtectionPlugin()(config)
    if (search) {
      result = await searchPlugin({ extraSkipKeys: searchSkipKeys })(result)
    }
    if (invites) {
      result = await invitesPlugin()(result)
    }
    result = await previewAuthPlugin()(result)
    if (email) {
      result = {
        ...result,
        email: lettermintEmail({ fromAddress: email.fromAddress, fromName: email.fromName }),
      }
    }
    result = {
      ...result,
      collections: [...(result.collections ?? []), ContentReviewNotes],
      admin: {
        ...(result.admin ?? {}),
        components: {
          ...(result.admin?.components ?? {}),
          providers: [
            ...(result.admin?.components?.providers ?? []),
            '@cms/components/HeaderScrollBehavior',
          ],
          beforeNavLinks: [
            ...(result.admin?.components?.beforeNavLinks ?? []),
            {
              path: '@cms/components/DocumentSwitcher',
              clientProps: { excludedSlugs },
            },
          ],
        },
      },
    }
    return result
  }
}
