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
                event: {
                    token,
                    siteKey: RECAPTCHA_SITE_KEY,
                },
            },
        })
        return (response.tokenProperties?.valid === true) && ((response.riskAnalysis?.score ?? 0) > 0.5)
    } catch (error) {
        console.error('reCAPTCHA verification error:', error)
        return false
    }
}

async function sendDiscordNotification(title: string, message: string, color: number = 15158332) {
    if (!DISCORD_WEBHOOK_URL) return
    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{
                    title,
                    description: message,
                    color,
                    timestamp: new Date().toISOString(),
                }],
            }),
        })
    } catch (error) {
        console.error('Discord notification failed:', error)
    }
}

function fillTemplate(source: string, data: Record<string, any>): string {
    let filled = source
    for (const key in data) {
        filled = filled.replace(new RegExp(`\\{${key}\\}`, 'g'), String(data[key] ?? ''))
    }
    return filled.replace(/\{[^}]+\}/g, '')
}

export const POST: RequestHandler = async ({ request }) => {
    ensureSgMail()
    let messageId: number | null = null

    try {
        const [contactFormData, contactSettingsData] = await request.json()

        if (contactFormData.recaptchaToken) {
            const isValid = await verifyRecaptcha(contactFormData.recaptchaToken)
            if (!isValid) {
                sendDiscordNotification(
                    'reCAPTCHA Verification Failed',
                    `User failed reCAPTCHA.\n**Email:** ${contactFormData.email}`,
                    0xFF6C00,
                ).catch(console.error)
                return new Response(JSON.stringify({ error: 'reCAPTCHA verification failed' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                })
            }
        }

        try {
            const payload = await getPayloadInstance()
            const created = await payload.create({
                collection: 'messages' as any,
                data: {
                    fullName: contactFormData.full_name || '',
                    email: contactFormData.email,
                    companyName: contactFormData.company_name || '',
                    subjects: contactFormData.subject || '',
                    message: contactFormData.message || '',
                    currentPage: contactFormData.currentPage || '',
                    userAgent: request.headers.get('user-agent') || '',
                    status: 'sent',
                } as any,
            })
            messageId = (created as { id: number }).id
        } catch (dbError) {
            console.error('Message DB persist failed:', dbError)
        }

        const textVars = {
            full_name: contactFormData.full_name || '',
            email: contactFormData.email || '',
            company_name: contactFormData.company_name || '',
            phone_number: contactFormData.phone_number || '',
            subject: contactFormData.subject || '',
            message: contactFormData.message || '',
        }
        const htmlVars = {
            full_name: escapeHtml(textVars.full_name),
            email: escapeHtml(textVars.email),
            company_name: escapeHtml(textVars.company_name),
            phone_number: escapeHtml(textVars.phone_number),
            subject: escapeHtml(textVars.subject),
            message: escapeHtmlMultiline(textVars.message),
        }

        const projectName = contactSettingsData.email_project_name || ''
        const siteUrl = PUBLIC_SITE_URL || ''
        const logoUrl = contactSettingsData.email_logo_url || undefined

        const yourInnerHtml = dropEmptyContent(
            fillTemplate(contactSettingsData.your_message || '', htmlVars),
        )
        const confirmationInnerHtml = dropEmptyContent(
            fillTemplate(contactSettingsData.confirmation_message || '', htmlVars),
        )

        const yourEmailData = {
            to: contactSettingsData.email_to,
            from: contactSettingsData.email_from,
            replyTo: contactFormData.email,
            subject: contactSettingsData.your_subject
                ? fillTemplate(contactSettingsData.your_subject, textVars)
                : textVars.subject,
            html: wrapEmailHtml(yourInnerHtml, {
                projectName,
                siteUrl,
                logoUrl,
                previewText: `New contact form submission from ${textVars.full_name || textVars.email}`,
                footerNote: contactSettingsData.your_footer_note || undefined,
            }),
        }

        const confirmationEmailData = {
            to: contactFormData.email,
            from: contactSettingsData.email_from,
            replyTo: contactSettingsData.email_from,
            subject: fillTemplate(contactSettingsData.confirmation_subject || '', textVars),
            html: wrapEmailHtml(confirmationInnerHtml, {
                projectName,
                siteUrl,
                logoUrl,
                previewText: `We received your message and will get back to you shortly.`,
                footerNote: contactSettingsData.confirmation_footer_note || undefined,
            }),
        }

        await sgMail.send(confirmationEmailData)
        await sgMail.send(yourEmailData)

        return new Response(
            JSON.stringify({ message: 'Success' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error('sendEmail error:', errorMessage)

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
