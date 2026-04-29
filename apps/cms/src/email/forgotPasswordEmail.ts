export interface ForgotPasswordEmailOptions {
  projectName: string
  adminUrl: string
  fullProjectName?: string
  siteUrl?: string
}

type ForgotPasswordArgs = {
  req?: unknown
  token?: string
  user?: { email?: string; name?: string; isInvite?: boolean } & Record<string, unknown>
} | undefined

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

export function forgotPasswordEmail(options: ForgotPasswordEmailOptions) {
  const { projectName, adminUrl, fullProjectName, siteUrl } = options
  const base = adminUrl.replace(/\/$/, '')
  const footerName = fullProjectName ?? projectName

  return {
    generateEmailSubject: (args: ForgotPasswordArgs) => {
      if (args?.user?.isInvite) return `You've been invited to ${projectName}`
      return `Reset your ${projectName} password`
    },
    generateEmailHTML: (args: ForgotPasswordArgs) => {
      const token = args?.token
      const user = args?.user
      const link = `${base}/admin/reset/${token}`
      const isInvite = Boolean(user?.isInvite)
      const name = typeof user?.name === 'string' ? user.name.trim() : ''

      const title = isInvite ? `Welcome to ${projectName}` : `Reset your password`
      const greeting = name ? `Hello, ${escapeHtml(name)}.` : ''
      const intro = isInvite
        ? `You've been invited to ${projectName}. Click the button below to set your password and sign in.`
        : `Someone (hopefully you) requested a password reset for your ${projectName} account. Click the button below to choose a new password.`
      const buttonText = isInvite ? 'Set your password' : 'Reset password'
      const expiryNote = isInvite
        ? 'This invitation link expires in 7 days.'
        : 'This link expires in 1 hour.'
      const ignoreNote = isInvite
        ? `If you weren't expecting this invitation, you can safely ignore this email.`
        : `If you didn't request this, you can safely ignore this email — your password won't change.`
      const supportNote = isInvite
        ? `If you run into any issues, just reply to this email and we'll help you out.`
        : ''

      const font = `font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,sans-serif;`
      const muted = `color:#888888;`

      // Nested <span> inside <a> is the Outlook-safe link trick — New Outlook
      // restyles the <a> but honors the inner <span>'s inline color.
      const linkStyle = `color:#888888;text-decoration:none;${font}`
      const footerLinks: string[] = []
      if (siteUrl) {
        footerLinks.push(
          `<a href="${siteUrl}" style="${linkStyle}"><span style="${linkStyle}">${stripScheme(siteUrl)}</span></a>`,
        )
      }
      footerLinks.push(
        `<a href="${adminUrl}" style="${linkStyle}"><span style="${linkStyle}">${stripScheme(adminUrl)}</span></a>`,
      )

      return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <meta name="color-scheme" content="light dark"/>
    <meta name="supported-color-schemes" content="light dark"/>
    <style>
      /* New Outlook / Outlook.com sanitizer injects its own a:link and
         MsoHyperlink rules. Override at high specificity so our inline
         color:inherit isn't overpowered. */
      a, a:link, a:visited, a:hover, a:active,
      span.MsoHyperlink, span.MsoHyperlinkFollowed {
        color: inherit !important;
        text-decoration: none !important;
        mso-style-priority: 100 !important;
      }
    </style>
  </head>
  <body style="margin:0;padding:0;${font}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:32px 20px;${font}">
      <tr>
        <td align="center" style="${font}">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;${font}">
            <tr>
              <td style="padding:0 0 24px;${font}">
                <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;line-height:1.3;${font}">${title}</h1>
                ${greeting ? `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;${font}">${greeting}</p>` : ''}
                <p style="margin:0 0 24px;font-size:16px;line-height:1.6;${font}">${intro}</p>
                <p style="margin:0 0 28px;font-size:17px;line-height:1.6;${font}">
                  <a href="${link}" style="color:inherit;text-decoration:none;${font}"><span style="color:inherit;text-decoration:none;font-weight:700;">${buttonText} &rarr;</span></a>
                </p>
                <p style="margin:0 0 8px;font-size:14px;line-height:1.6;${muted}${font}">Or copy and paste this URL into your browser:</p>
                <p style="margin:0 0 24px;font-size:13px;line-height:1.6;word-break:break-all;${muted}${font}"><a href="${link}" style="color:#888888;text-decoration:none;${font}"><span style="color:#888888;text-decoration:none;">${link}</span></a></p>
                <p style="margin:0 0 8px;font-size:14px;line-height:1.6;${muted}${font}">${expiryNote}</p>
                <p style="margin:0 0 ${supportNote ? '8px' : '0'};font-size:14px;line-height:1.6;${muted}${font}">${ignoreNote}</p>
                ${supportNote ? `<p style="margin:0;font-size:14px;line-height:1.6;${muted}${font}">${supportNote}</p>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 0 0;border-top:1px solid #999999;${font}">
                <p style="margin:0;font-size:13px;font-weight:600;${font}">${footerName}</p>
                <p style="margin:6px 0 0;font-size:12px;${muted}${font}">${footerLinks.join(' &middot; ')}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
    },
  }
}
