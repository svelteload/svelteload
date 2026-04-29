import { nodemailerAdapter } from '@payloadcms/email-nodemailer'

export interface SendgridEmailOptions {
  fromAddress: string
  fromName: string
  apiKey?: string
}

export function sendgridEmail(options: SendgridEmailOptions) {
  const apiKey = options.apiKey ?? process.env.SENDGRID_API_KEY

  if (!apiKey) {
    throw new Error(
      '[sendgridEmail] SENDGRID_API_KEY is not set — email cannot be sent. ' +
        'Set it in your admin app .env file.',
    )
  }

  return nodemailerAdapter({
    defaultFromAddress: options.fromAddress,
    defaultFromName: options.fromName,
    transportOptions: {
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: {
        user: 'apikey',
        pass: apiKey,
      },
    },
  })
}
