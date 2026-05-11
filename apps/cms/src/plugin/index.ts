import type { Config, Plugin } from 'payload'
import { ContentReviewNotes } from '@cms/collections/ContentReviewNotes'
import { draftProtectionPlugin } from '@cms/plugins/draftProtectionPlugin'
import { searchPlugin } from '@cms/plugins/searchPlugin'
import { invitesPlugin } from '@cms/invites/plugin'
import { previewAuthPlugin } from '@cms/previewAuth/plugin'
import { sendgridEmail } from '@cms/email/sendgridEmail'

export interface PayloadAdminPluginOptions {
  search?: boolean
  searchSkipKeys?: string[]
  email?: {
    fromAddress: string
    fromName: string
  } | false
  invites?: boolean
}

export function payloadAdminPlugin(options: PayloadAdminPluginOptions = {}): Plugin {
  const { search = true, searchSkipKeys, email, invites = true } = options
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
        email: sendgridEmail({ fromAddress: email.fromAddress, fromName: email.fromName }),
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
        },
      },
    }
    return result
  }
}
