export type EmailShellOptions = {
    /** Full project name shown in the footer. Required — no hardcoded default. */
    projectName: string
    /** Site URL shown as a link in the footer. Required. */
    siteUrl: string
    /** Absolute URL of a logo image to show in the footer of the email, above the project name. Optional. */
    logoUrl?: string
    /** Hidden preview text shown in the inbox preview pane. */
    previewText?: string
    /** Small grey note shown below the footer links. Leave empty to hide. */
    footerNote?: string
}

const FONT = `font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,sans-serif;`
const MUTED_COLOR = '#888888'

/**
 * Wraps user-authored email HTML in a minimal branded shell.
 *
 * New Outlook on Windows (and Outlook.com's server-side sanitizer) strip
 * or override rules in <style> blocks — specifically a:link, <hr>, and
 * list bullets. We defensively inline every Outlook-critical style on each
 * element via `inlineEmailStyles()` before placing the HTML in the shell.
 *
 * Content authors can insert a horizontal rule (<hr>) in the rich text —
 * the first one acts as an invisible break that mutes and shrinks
 * everything after it (the "appendix" section: Your message / contact info).
 */
export function wrapEmailHtml(innerHtml: string, opts: EmailShellOptions): string {
    const { projectName, siteUrl, logoUrl, previewText = '', footerNote } = opts

    const preview = previewText
        ? `<div style="display:none;overflow:hidden;line-height:1;max-height:0;max-width:0;opacity:0;">${previewText}</div>`
        : ''

    const siteHost = siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')

    const footerLogoRow = logoUrl
        ? `<tr>
              <td style="padding:16px 0 12px;border-top:1px solid #999999;${FONT}">
                <img src="${logoUrl}" alt="${projectName}" width="140" style="display:block;max-width:140px;height:auto;border:0;" />
              </td>
            </tr>`
        : ''

    // When a logo is present, it gets its own row with the top border. The
    // text block below then starts with no top border (already drawn by the
    // logo row) and no top padding (the logo row provides the gap).
    const footerTextPadding = logoUrl
        ? 'padding:0;'
        : 'padding:16px 0 0;border-top:1px solid #999999;'

    const processedInner = inlineEmailStyles(innerHtml)

    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <meta name="color-scheme" content="light dark"/>
    <meta name="supported-color-schemes" content="light dark"/>
    <style>
      /* Outlook/Mso link override — catches auto-linked email addresses and URLs. */
      a, a:link, a:visited, a:hover, a:active,
      span.MsoHyperlink, span.MsoHyperlinkFollowed {
        color: inherit !important;
        text-decoration: none !important;
        mso-style-priority: 100 !important;
      }
      /* Empty paragraph collapse (belt-and-suspenders; dropEmptyContent also strips). */
      p:empty { display: none; }
    </style>
  </head>
  <body style="margin:0;padding:0;${FONT}">
    ${preview}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:32px 20px;${FONT}">
      <tr>
        <td align="center" style="${FONT}">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;${FONT}">
            <tr>
              <td style="padding:0 0 24px;font-size:16px;line-height:1.6;${FONT}">
                ${processedInner}
              </td>
            </tr>
            ${footerLogoRow}
            <tr>
              <td style="${footerTextPadding}${FONT}">
                <p style="margin:0;font-size:13px;font-weight:600;${FONT}">${projectName}</p>
                <p style="margin:6px 0 0;font-size:12px;color:${MUTED_COLOR};${FONT}">
                  <a href="${siteUrl}" style="color:${MUTED_COLOR};text-decoration:none;${FONT}"><span style="color:${MUTED_COLOR};text-decoration:none;">${siteHost}</span></a>
                </p>
                ${footerNote ? `<p style="margin:8px 0 0;font-size:12px;color:${MUTED_COLOR};${FONT}">${footerNote}</p>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/**
 * Inlines every Outlook-critical style on the Lexical-converted HTML.
 *
 * - <a> gets color:inherit+text-decoration:none inline AND an inner <span>
 *   with the same styles (New Outlook restyles the <a> but leaves the span).
 * - The FIRST <hr> marks the boundary into the "appendix" section (muted,
 *   smaller). All <hr>s become invisible spacer divs (Outlook's Word
 *   renderer ignores hr border-reset; div is the only reliable option).
 * - <ul>/<li> get inline bullet-off styles.
 * - Below the boundary, every element gets inline font-size/color/margin so
 *   Outlook can't fall back to its own styling.
 */
function inlineEmailStyles(html: string): string {
    // 1. Link styling (applies to both sections, uniform).
    html = inlineLinkStyles(html)

    // 2. Detect the first <hr>. If absent, just style the main section.
    const hrMatch = html.match(/<hr\b[^>]*\/?>/i)
    if (!hrMatch) {
        return applyMainStyles(html)
    }

    const firstHrIdx = html.indexOf(hrMatch[0])
    const before = html.substring(0, firstHrIdx)
    const afterRaw = html.substring(firstHrIdx + hrMatch[0].length)

    const styledBefore = applyMainStyles(before)

    // Appendix: replace any remaining <hr>s with spacer divs, then inline styles.
    const afterNoHr = afterRaw.replace(/<hr\b[^>]*\/?>/gi, SPACER_DIV)
    const styledAfter = applyAppendixStyles(afterNoHr)

    // Stitch: main + invisible spacer + appendix wrapper. The appendix wrapper
    // sets font-size only — color is NOT set here so content (subject, message,
    // contact items) inherits the body's default text color (white in dark
    // mode, black in light). Only labels (h3, em/i) carry an explicit muted color.
    return `${styledBefore}${SPACER_DIV}<div style="font-size:14px;line-height:1.5;${FONT}">${styledAfter}</div>`
}

const SPACER_DIV = '<div style="font-size:1px;line-height:1px;height:0;margin:28px 0 0;mso-line-height-rule:exactly;">&#8202;</div>'

function stripStyleAttr(attrs: string): string {
    return attrs.replace(/\sstyle=(['"])[\s\S]*?\1/g, '')
}

function inlineLinkStyles(html: string): string {
    // Wrap <a>...</a>: strip existing style, add inline no-underline+inherit,
    // then wrap inner content in a <span> with the same styles. The nested
    // span is the "load-bearing" trick — New Outlook restyles the <a> but
    // honors the span's inline style.
    return html.replace(/<a(\s[^>]*?)?>([\s\S]*?)<\/a>/gi, (_m, attrs, inner) => {
        const cleanAttrs = attrs ? stripStyleAttr(attrs) : ''
        return `<a${cleanAttrs} style="color:inherit;text-decoration:none;"><span style="color:inherit;text-decoration:none;">${inner}</span></a>`
    })
}

/**
 * Main section (above the first hr):
 * - em/i rendered as a muted inline note (grey, smaller, NOT italic font)
 * - Lists styled bullet-less (in case author uses lists in the main copy)
 */
function applyMainStyles(html: string): string {
    const noteStyle = `color:${MUTED_COLOR};font-size:14px;font-style:normal;`
    html = html.replace(/<em>([\s\S]*?)<\/em>/gi, `<span style="${noteStyle}">$1</span>`)
    html = html.replace(/<i>([\s\S]*?)<\/i>/gi, `<span style="${noteStyle}">$1</span>`)
    html = applyBulletlessLists(html, false)
    return html
}

function applyBulletlessLists(html: string, tight: boolean): string {
    const ulStyle = tight
        ? 'list-style:none;padding:0;margin:16px 0 0;mso-special-format:none;'
        : 'list-style:none;padding:0;margin:0 0 14px;mso-special-format:none;'
    html = html.replace(/<ul(\s[^>]*?)?>/gi, (_m, attrs) => {
        const cleanAttrs = attrs ? stripStyleAttr(attrs) : ''
        return `<ul${cleanAttrs} style="${ulStyle}">`
    })
    return html
}

/**
 * Appendix section (below the first hr):
 * - em/i and h3 → tiny uppercase muted label (the ONLY muted parts)
 * - h2 → prominent section heading (body color)
 * - p → slightly smaller body (body color)
 * - ul/li → tight, bullet-less, body-color contact list
 */
function applyAppendixStyles(html: string): string {
    const labelStyle = `color:${MUTED_COLOR};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;font-style:normal;`
    html = html.replace(/<em>([\s\S]*?)<\/em>/gi, `<span style="${labelStyle}">$1</span>`)
    html = html.replace(/<i>([\s\S]*?)<\/i>/gi, `<span style="${labelStyle}">$1</span>`)

    // h2 → body-color section heading (e.g., the customer's subject)
    html = html.replace(/<h2(\s[^>]*?)?>([\s\S]*?)<\/h2>/gi, (_m, attrs, inner) => {
        const cleanAttrs = attrs ? stripStyleAttr(attrs) : ''
        return `<h2${cleanAttrs} style="font-size:18px;font-weight:700;margin:0 0 8px;line-height:1.3;">${inner}</h2>`
    })

    // h3 → tiny uppercase muted label
    html = html.replace(/<h3(\s[^>]*?)?>([\s\S]*?)<\/h3>/gi, (_m, attrs, inner) => {
        const cleanAttrs = attrs ? stripStyleAttr(attrs) : ''
        return `<h3${cleanAttrs} style="${labelStyle}margin:18px 0 4px;">${inner}</h3>`
    })

    // p → body-color appendix text
    html = html.replace(/<p(\s[^>]*?)?>([\s\S]*?)<\/p>/gi, (m, attrs, inner) => {
        if (attrs && /style=/.test(attrs)) return m
        return `<p${attrs || ''} style="font-size:15px;line-height:1.5;margin:0 0 10px;">${inner}</p>`
    })

    // Tight bullet-less contact list, body-color (not muted) so items match
    // the rest of the appendix body text. Outlook auto-linked emails inside
    // should inherit this color via the MsoHyperlink override in the <style>.
    html = applyBulletlessLists(html, true)
    html = html.replace(/<li(\s[^>]*?)?>([\s\S]*?)<\/li>/gi, (_m, attrs, inner) => {
        const cleanAttrs = attrs ? stripStyleAttr(attrs) : ''
        return `<li${cleanAttrs} style="list-style:none;margin:0 0 2px;padding:0;font-size:13px;line-height:1.5;mso-special-format:none;">${inner}</li>`
    })

    return html
}

/**
 * Escapes HTML special chars. Use on user-provided template values before
 * substituting them into the email HTML, so a customer typing "<script>" or
 * "<img>" in the message field can't break the email layout.
 */
export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

/**
 * Like escapeHtml, but additionally converts newlines to <br/> so multi-line
 * textarea input renders with line breaks inside a single <p>.
 */
export function escapeHtmlMultiline(value: string): string {
    return escapeHtml(value).replace(/\r?\n/g, '<br/>')
}

/**
 * Removes paragraphs and list items whose rendered text is empty,
 * whitespace-only, or a bare label ending in ":" with no value. Used to
 * auto-hide optional-field lines like "{phone_number}" when the user didn't
 * provide a phone, regardless of whether they're in a <p> or an <li>.
 */
export function dropEmptyContent(html: string): string {
    const isEmptyText = (inner: string): boolean => {
        const text = inner
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .trim()
        if (text === '') return true
        if (/^[^:]+:\s*$/.test(text)) return true
        return false
    }
    html = html.replace(/<p[^>]*>([\s\S]*?)<\/p>/g, (m, inner) => (isEmptyText(inner) ? '' : m))
    html = html.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (m, inner) => (isEmptyText(inner) ? '' : m))
    return html
}
