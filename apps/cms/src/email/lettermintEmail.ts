import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { lettermintTransportOptions } from '@svelteload/payload/email/lettermint'

export interface LettermintEmailOptions {
  fromAddress: string
  fromName: string
  apiKey?: string
}

export function lettermintEmail(options: LettermintEmailOptions) {
  const apiKey = options.apiKey ?? process.env.LETTERMINT_API_KEY

  if (!apiKey) {
    throw new Error(
      '[lettermintEmail] LETTERMINT_API_KEY is not set, so email cannot be sent. ' +
        'Set it in your cms app .env file.',
    )
  }

  return nodemailerAdapter({
    defaultFromAddress: options.fromAddress,
    defaultFromName: options.fromName,
    transportOptions: lettermintTransportOptions(apiKey),
    // Payload builds its config lazily on the first request, so an awaited
    // verify() puts an SMTP round trip in front of the first /admin load and a
    // DNS stall in front of every cold start. It only logs on failure, so it
    // buys nothing that the send path doesn't already report.
    skipVerify: true,
  })
}
