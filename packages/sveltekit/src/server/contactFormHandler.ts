import sgMail from '@sendgrid/mail'
import type { RequestHandler } from '@sveltejs/kit'
import { RecaptchaEnterpriseServiceClient } from '@google-cloud/recaptcha-enterprise'
import {
    SENDGRID_API_KEY,
    GOOGLE_CLOUD_PROJECT_ID,
    GOOGLE_CLOUD_CLIENT_EMAIL,
    GOOGLE_CLOUD_PRIVATE_KEY,
    RECAPTCHA_SITE_KEY,
    DISCORD_WEBHOOK_URL,
} from '$env/static/private'
import { PUBLIC_SITE_URL } from '$env/static/public'
import { projectMeta } from 'project-meta/projectMeta'
import { getPayloadInstance } from './payload'
import { wrapEmailHtml, escapeHtml, escapeHtmlMultiline, dropEmptyContent } from './emailShell'

let recaptchaClientCache: RecaptchaEnterpriseServiceClient | null = null
function getRecaptchaClient(): RecaptchaEnterpriseServiceClient {
    if (recaptchaClientCache) return recaptchaClientCache
    recaptchaClientCache = new RecaptchaEnterpriseServiceClient({
        projectId: GOOGLE_CLOUD_PROJECT_ID,
        credentials: {
            type: 'service_account',
            project_id: GOOGLE_CLOUD_PROJECT_ID,
            private_key: GOOGLE_CLOUD_PRIVATE_KEY,
            client_email: GOOGLE_CLOUD_CLIENT_EMAIL,
        },
    })
    return recaptchaClientCache
}

let sgMailReady = false
function ensureSgMail(): void {
    if (sgMailReady) return
    sgMail.setApiKey(SENDGRID_API_KEY)
    sgMailReady = true
}

async function verifyRecaptcha(token: string): Promise<boolean> {
    try {
        const client = getRecaptchaClient()
        const projectPath = client.projectPath(GOOGLE_CLOUD_PROJECT_ID)
        const [response] = await client.createAssessment({
            parent: projectPath,
            assessment: {
                event: { token, siteKey: RECAPTCHA_SITE_KEY },
            },
        })
        return (response.tokenProperties?.valid === true) && ((response.riskAnalysis?.score ?? 0) > 0.5)
    } catch (error) {
        console.error('reCAPTCHA verification error:', error)
        return false
    }
}

async function sendDiscordNotification(title: string, message: string, color: number): Promise<void> {
    if (!DISCORD_WEBHOOK_URL) return
    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{ title, description: message, color, timestamp: new Date().toISOString() }],
            }),
        })
    } catch (error) {
        console.error('Discord notification failed:', error)
    }
}

type NormalizedForm = {
    fullName: string
    email: string
    companyName: string
    phoneNumber: string
    subject: string
    subjects: string[]
    message: string
    currentPage: string
    recaptchaToken: string
}

type NormalizedSettings = {
    emailTo: string
    emailFrom: string
    emailProjectName: string
    emailLogoUrl: string
    yourSubject: string
    yourPreHeader: string
    yourMessage: string
    yourFooterNote: string
    confirmationSubject: string
    confirmationPreHeader: string
    confirmationMessage: string
    confirmationFooterNote: string
}

function normalizeForm(raw: any): NormalizedForm {
    const fullName = raw.fullName ?? raw.full_name ?? ''
    const email = raw.email ?? ''
    const companyName = raw.companyName ?? raw.company_name ?? ''
    const phoneNumber = raw.phoneNumber ?? raw.phone_number ?? ''
    let subjects: string[] = []
    if (Array.isArray(raw.subjects)) {
        subjects = raw.subjects.map((s: any) => String(s)).filter((s: string) => s.length > 0)
    } else if (typeof raw.subjects === 'string' && raw.subjects.length > 0) {
        subjects = [raw.subjects]
    } else if (typeof raw.subject === 'string' && raw.subject.length > 0) {
        subjects = [raw.subject]
    }
    const subject = subjects[0] ?? ''
    const message = raw.message ?? ''
    const currentPage = raw.currentPage ?? raw.current_page ?? ''
    const recaptchaToken = raw.recaptchaToken ?? ''
    return { fullName, email, companyName, phoneNumber, subject, subjects, message, currentPage, recaptchaToken }
}

function normalizeSettings(combined: any | null, alt: any | null): NormalizedSettings {
    const c = combined ?? {}
    const a = alt ?? {}
    return {
        emailTo: c.email_to ?? c.toEmail ?? a.email_to ?? a.toEmail ?? '',
        emailFrom: c.email_from ?? c.fromEmail ?? a.email_from ?? a.fromEmail ?? '',
        emailProjectName: c.email_project_name ?? c.projectName ?? '',
        emailLogoUrl: c.email_logo_url ?? c.logoUrl ?? '',
        yourSubject: c.your_subject ?? c.internalSubject ?? '',
        yourPreHeader: c.internal_pre_header ?? c.internalPreHeader ?? a.internal_pre_header ?? a.internalPreHeader ?? '',
        yourMessage: c.your_message ?? c.internalTemplate ?? '',
        yourFooterNote: c.your_footer_note ?? c.internalFooterNote ?? '',
        confirmationSubject: a.confirmationSubject ?? a.confirmation_subject ?? c.confirmation_subject ?? c.confirmationSubject ?? '',
        confirmationPreHeader: a.confirmationPreHeader ?? a.confirmation_pre_header ?? c.confirmation_pre_header ?? c.confirmationPreHeader ?? '',
        confirmationMessage: a.confirmationTemplate ?? a.confirmation_message ?? c.confirmation_message ?? c.confirmationTemplate ?? '',
        confirmationFooterNote: a.confirmationFooterNote ?? a.confirmation_footer_note ?? c.confirmation_footer_note ?? c.confirmationFooterNote ?? '',
    }
}

function formatSubjectsHtml(subjects: string[]): string {
    if (subjects.length === 0) return ''
    if (subjects.length === 1) return escapeHtml(subjects[0])
    return subjects.map((s) => `• ${escapeHtml(s)}`).join('<br>')
}

function buildTextVars(form: NormalizedForm, attachmentFilenames: string, attachmentCount: number): Record<string, string> {
    const subjectsText = form.subjects.join(', ')
    return {
        full_name: form.fullName,
        fullName: form.fullName,
        email: form.email,
        company_name: form.companyName,
        companyName: form.companyName,
        phone_number: form.phoneNumber,
        phoneNumber: form.phoneNumber,
        subject: form.subject,
        subjects: subjectsText,
        message: form.message,
        current_page: form.currentPage,
        currentPage: form.currentPage,
        attachment_filenames: attachmentFilenames,
        attachmentFilenames: attachmentFilenames,
        attachment_count: String(attachmentCount),
        attachmentCount: String(attachmentCount),
    }
}

function buildHtmlVars(form: NormalizedForm, attachmentFilenames: string, attachmentCount: number): Record<string, string> {
    return {
        full_name: escapeHtml(form.fullName),
        fullName: escapeHtml(form.fullName),
        email: escapeHtml(form.email),
        company_name: escapeHtml(form.companyName),
        companyName: escapeHtml(form.companyName),
        phone_number: escapeHtml(form.phoneNumber),
        phoneNumber: escapeHtml(form.phoneNumber),
        subject: escapeHtml(form.subject),
        subjects: formatSubjectsHtml(form.subjects),
        message: escapeHtmlMultiline(form.message),
        current_page: escapeHtml(form.currentPage),
        currentPage: escapeHtml(form.currentPage),
        attachment_filenames: escapeHtml(attachmentFilenames),
        attachmentFilenames: escapeHtml(attachmentFilenames),
        attachment_count: String(attachmentCount),
        attachmentCount: String(attachmentCount),
    }
}

function fillTemplate(source: string, vars: Record<string, string>): string {
    let out = source
    for (const key in vars) {
        out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), vars[key] ?? '')
    }
    return out.replace(/\{[^}]+\}/g, '')
}

function formatContactContext(form: NormalizedForm, userAgent: string | null): string {
    const lines: string[] = []
    if (form.fullName) lines.push(`**Name:** ${form.fullName}`)
    if (form.email) lines.push(`**Email:** ${form.email}`)
    if (form.companyName) lines.push(`**Company:** ${form.companyName}`)
    if (form.phoneNumber) lines.push(`**Phone:** ${form.phoneNumber}`)
    if (form.subjects.length) lines.push(`**Subject:** ${form.subjects.join(', ')}`)
    if (form.message) {
        const snippet = form.message.slice(0, 300)
        const truncated = form.message.length > 300 ? '…' : ''
        lines.push(`**Message:** ${snippet}${truncated}`)
    }
    if (form.currentPage) lines.push(`**Page:** ${form.currentPage}`)
    if (userAgent) lines.push(`**User Agent:** ${userAgent}`)
    return lines.join('\n')
}

export const POST: RequestHandler = async ({ request }) => {
    ensureSgMail()
    let messageId: number | null = null
    let form: NormalizedForm | null = null

    try {
        const contentType = request.headers.get('content-type') || ''
        if (!contentType.includes('multipart/form-data')) {
            return new Response(
                JSON.stringify({ error: 'multipart/form-data required' }),
                { status: 415, headers: { 'Content-Type': 'application/json' } },
            )
        }

        const fd = await request.formData()
        const rawForm = JSON.parse((fd.get('formData') as string | null) ?? '{}')
        const settingsPart = fd.get('settings') as string | null
        const emailConfigPart = fd.get('emailConfig') as string | null
        const confirmationEmailPart = fd.get('confirmationEmail') as string | null
        const rawCombined = settingsPart ? JSON.parse(settingsPart) : (emailConfigPart ? JSON.parse(emailConfigPart) : null)
        const rawConfirmation = confirmationEmailPart ? JSON.parse(confirmationEmailPart) : null

        form = normalizeForm(rawForm)
        const settings = normalizeSettings(rawCombined, rawConfirmation)

        const attachments: Array<{ content: string; filename: string; type: string; disposition: string }> = []
        for (const [key, value] of fd.entries()) {
            if (key.startsWith('attachment_') && value instanceof File) {
                const buffer = await value.arrayBuffer()
                attachments.push({
                    content: Buffer.from(buffer).toString('base64'),
                    filename: value.name,
                    type: value.type,
                    disposition: 'attachment',
                })
            }
        }
        const attachmentFilenames = attachments.map((a) => a.filename).join(', ')
        const attachmentCount = attachments.length

        if (form.recaptchaToken && RECAPTCHA_SITE_KEY) {
            const ok = await verifyRecaptcha(form.recaptchaToken)
            if (!ok) {
                const ctx = formatContactContext(form, request.headers.get('user-agent'))
                sendDiscordNotification(
                    'reCAPTCHA Verification Failed',
                    `User failed reCAPTCHA verification.\n\n${ctx}`,
                    0xFF6C00,
                ).catch(console.error)
                return new Response(
                    JSON.stringify({ error: 'reCAPTCHA verification failed' }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } },
                )
            }
        }

        try {
            const payload = await getPayloadInstance()
            const created = await payload.create({
                collection: 'messages' as any,
                data: {
                    fullName: form.fullName,
                    email: form.email,
                    companyName: form.companyName,
                    subjects: form.subjects.join(', '),
                    message: form.message,
                    currentPage: form.currentPage,
                    userAgent: request.headers.get('user-agent') || '',
                    attachmentCount,
                    status: 'sent',
                } as any,
            })
            messageId = (created as { id: number }).id
        } catch (dbError) {
            const dbErr = dbError instanceof Error ? dbError.message : String(dbError)
            console.error('Message DB persist failed:', dbErr)
            sendDiscordNotification(
                'Message DB Persist Failed',
                `Could not store submission in Payload. SendGrid will still attempt delivery.\n\n**DB Error:** ${dbErr}\n**User:** ${form.fullName} (${form.email})`,
                0xFF6C00,
            ).catch(console.error)
        }

        const textVars = buildTextVars(form, attachmentFilenames, attachmentCount)
        const htmlVars = buildHtmlVars(form, attachmentFilenames, attachmentCount)

        const projectName = settings.emailProjectName || projectMeta.fullProjectName || ''
        const siteUrl = PUBLIC_SITE_URL || ''
        const logoUrl = settings.emailLogoUrl || undefined

        const yourInner = dropEmptyContent(fillTemplate(settings.yourMessage, htmlVars))
        const yourSubjectLine = settings.yourSubject
            ? fillTemplate(settings.yourSubject, textVars)
            : (textVars.subject || 'Contact form submission')
        const yourEmailData = {
            to: settings.emailTo,
            from: settings.emailFrom,
            replyTo: form.email,
            subject: yourSubjectLine,
            html: wrapEmailHtml(yourInner, {
                projectName,
                siteUrl,
                logoUrl,
                previewText: settings.yourPreHeader ? fillTemplate(settings.yourPreHeader, textVars) : '',
                footerNote: settings.yourFooterNote || undefined,
            }),
            attachments,
        }

        const confirmInner = dropEmptyContent(fillTemplate(settings.confirmationMessage, htmlVars))
        const confirmationEmailData = {
            to: form.email,
            from: settings.emailFrom,
            replyTo: settings.emailFrom,
            subject: fillTemplate(settings.confirmationSubject || '', textVars),
            html: wrapEmailHtml(confirmInner, {
                projectName,
                siteUrl,
                logoUrl,
                previewText: settings.confirmationPreHeader ? fillTemplate(settings.confirmationPreHeader, textVars) : '',
                footerNote: settings.confirmationFooterNote || undefined,
            }),
        }

        await sgMail.send(confirmationEmailData)
        await sgMail.send(yourEmailData)

        return new Response(
            JSON.stringify({
                message: 'Success',
                attachments: attachments.map((a) => ({ filename: a.filename })),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error('contactFormHandler error:', errorMessage)

        if (form) {
            const ctx = formatContactContext(form, request.headers.get('user-agent'))
            sendDiscordNotification(
                'Contact Form Send Failed',
                `Email delivery failed.\n\n**Error:** ${errorMessage}\n\n${ctx}`,
                0xE74C3C,
            ).catch(console.error)
        }

        if (messageId != null) {
            try {
                const payload = await getPayloadInstance()
                await payload.update({
                    collection: 'messages' as any,
                    id: messageId,
                    data: { status: 'delivery_failed', errorMessage } as any,
                })
            } catch (dbError) {
                console.error('Failed to flag delivery_failed:', dbError)
            }
        }

        return new Response(
            JSON.stringify({ error: 'Failed to send email. Please try again.' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        )
    }
}
