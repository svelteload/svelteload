import type { GlobalConfig } from 'payload'
import { setGlobalAccess } from '@cms/access/roles'

export const ContactForm: GlobalConfig = {
    slug: 'contact-form',
    label: 'Contact Form',
    admin: { group: 'Site Configuration' },
    versions: { drafts: true },
    access: setGlobalAccess('editor'),
    fields: [
        {
            type: 'tabs',
            tabs: [
                {
                    label: 'Email Configuration',
                    fields: [
                        {
                            name: 'emailConfig',
                            type: 'group',
                            label: 'Internal Notification',
                            fields: [
                                {
                                    type: 'row',
                                    fields: [
                                        {
                                            name: 'fromEmail',
                                            type: 'email',
                                            required: true,
                                            admin: { width: '50%' },
                                        },
                                        {
                                            name: 'toEmail',
                                            type: 'email',
                                            required: true,
                                            admin: { width: '50%' },
                                        },
                                    ],
                                },
                                {
                                    name: 'internalSubject',
                                    type: 'text',
                                    required: true,
                                    localized: true,
                                    admin: {
                                        description: 'Subject line for the internal notification. Placeholders: {full_name}, {email}, {company_name}, {phone_number}, {subject}.',
                                    },
                                },
                                {
                                    name: 'internalPreHeader',
                                    type: 'text',
                                    localized: true,
                                    admin: {
                                        description: 'Optional preheader shown next to the subject in the inbox preview. Keep short, around 30-50 characters; mobile clients clip aggressively. Same placeholders as the subject. Leave empty to fall back to the email body\'s first line.',
                                    },
                                },
                                {
                                    name: 'internalTemplate',
                                    type: 'richText',
                                    required: true,
                                    localized: true,
                                    admin: {
                                        description: 'Body sent to the team. Placeholders: {full_name}, {email}, {company_name}, {phone_number}, {subject}, {subjects}, {message}, {current_page}, {attachment_filenames}, {attachment_count}. Insert a horizontal rule (---) to fade everything after it to muted grey. Lines with empty placeholder values are auto-hidden.',
                                    },
                                },
                                {
                                    name: 'internalFooterNote',
                                    type: 'textarea',
                                    localized: true,
                                    admin: {
                                        description: 'Optional small grey line at the very bottom of the internal email. Leave empty to hide.',
                                    },
                                },
                            ],
                        },
                        {
                            name: 'confirmationEmail',
                            type: 'group',
                            label: 'Customer Confirmation',
                            fields: [
                                {
                                    name: 'confirmationSubject',
                                    type: 'text',
                                    required: true,
                                    localized: true,
                                    admin: {
                                        description: 'Subject line for the confirmation email sent to the customer. Same placeholders available as the internal subject.',
                                    },
                                },
                                {
                                    name: 'confirmationPreHeader',
                                    type: 'text',
                                    localized: true,
                                    admin: {
                                        description: 'Optional preheader shown next to the subject in the customer\'s inbox preview. Keep short, around 30-50 characters; mobile clients clip aggressively. Same placeholders as the subject. Leave empty to fall back to the email body\'s first line.',
                                    },
                                },
                                {
                                    name: 'confirmationTemplate',
                                    type: 'richText',
                                    required: true,
                                    localized: true,
                                    admin: {
                                        description: 'Body sent to the customer. Same placeholders available as the internal template.',
                                    },
                                },
                                {
                                    name: 'confirmationFooterNote',
                                    type: 'textarea',
                                    localized: true,
                                    admin: {
                                        description: 'Optional small grey line at the very bottom of the confirmation email. Leave empty to hide.',
                                    },
                                },
                            ],
                        },
                        {
                            name: 'logo',
                            type: 'upload',
                            relationTo: 'media',
                            label: 'Email Logo',
                            admin: {
                                description: 'Optional brand logo shown above the project name in the email footer. Most often unused: many email clients block remote images by default and recipients see a broken icon until they approve images.',
                            },
                        },
                    ],
                },
                {
                    label: 'Form Configuration',
                    description: 'Form copy. Some fields here are alternatives (e.g. a free-text subject input vs. a list of subject options); only the variant rendered by the site\'s frontend is used. Populate the variant the site is configured to display.',
                    fields: [
                        {
                            name: 'contactHeader',
                            type: 'text',
                            label: 'Contact Header',
                            defaultValue: 'Contact',
                            localized: true,
                        },
                        {
                            name: 'subject',
                            type: 'group',
                            label: 'Subject',
                            admin: {
                                description: 'The frontend uses either the free-text "Subject Placeholder" (single text input) or the "Subject Options" array (selectable buttons or a dropdown). Only one variant is shown per site.',
                            },
                            fields: [
                                {
                                    name: 'heading',
                                    type: 'text',
                                    label: 'Subject Heading',
                                    defaultValue: 'Subject',
                                    localized: true,
                                },
                                {
                                    name: 'placeholder',
                                    type: 'text',
                                    label: 'Subject Placeholder',
                                    defaultValue: 'Subject',
                                    localized: true,
                                    admin: {
                                        description: 'Placeholder for the free-text subject input variant.',
                                    },
                                },
                                {
                                    name: 'subjects',
                                    type: 'array',
                                    label: 'Subject Options',
                                    admin: {
                                        description: 'Selectable subject options for the multi-choice variant.',
                                        components: {
                                            RowLabel: {
                                                path: '@cms/components/ArrayRowLabel',
                                                clientProps: {
                                                    fieldName: 'label',
                                                    fallback: 'Subject Option',
                                                },
                                            },
                                        },
                                    },
                                    fields: [
                                        {
                                            name: 'label',
                                            type: 'text',
                                            label: 'Display Text',
                                            localized: true,
                                            required: true,
                                        },
                                    ],
                                },
                                {
                                    name: 'contactPrompt',
                                    type: 'text',
                                    label: 'Contact Prompt',
                                    defaultValue: "Let's Talk",
                                    localized: true
                                },
                            ],
                        },
                        {
                            name: 'placeholders',
                            type: 'group',
                            fields: [
                                {
                                    type: 'row',
                                    fields: [
                                        {
                                            name: 'fullName',
                                            type: 'text',
                                            defaultValue: 'Full Name',
                                            localized: true,
                                            admin: { width: '50%' },
                                        },
                                        {
                                            name: 'company',
                                            type: 'text',
                                            defaultValue: 'Company',
                                            localized: true,
                                            admin: { width: '50%' },
                                        },
                                    ],
                                },
                                {
                                    type: 'row',
                                    fields: [
                                        {
                                            name: 'email',
                                            type: 'text',
                                            defaultValue: 'Email Address',
                                            localized: true,
                                            admin: { width: '50%' },
                                        },
                                        {
                                            name: 'phoneNumber',
                                            type: 'text',
                                            defaultValue: 'Phone Number',
                                            localized: true,
                                            admin: {
                                                width: '50%',
                                                description: 'Used only if the form renders a phone number field.',
                                            },
                                        },
                                    ],
                                },
                                {
                                    type: 'row',
                                    fields: [
                                        {
                                            name: 'message',
                                            type: 'text',
                                            defaultValue: 'Your Message',
                                            localized: true,
                                            admin: { width: '50%' },
                                        },
                                        {
                                            name: 'submitButton',
                                            type: 'text',
                                            defaultValue: 'Send Message',
                                            localized: true,
                                            admin: { width: '50%' },
                                        },
                                    ],
                                },
                            ],
                        },
                        {
                            name: 'fileUpload',
                            type: 'group',
                            label: 'File Upload',
                            admin: {
                                description: 'Used only if the form supports attachments.',
                            },
                            fields: [
                                {
                                    name: 'header',
                                    type: 'text',
                                    label: 'Header',
                                    defaultValue: 'Attach files',
                                    localized: true,
                                },
                                {
                                    name: 'dropPrompt',
                                    type: 'text',
                                    label: 'Drop Prompt',
                                    defaultValue: 'Drag & drop or click to choose files',
                                    localized: true,
                                },
                                {
                                    name: 'info',
                                    type: 'text',
                                    label: 'Info',
                                    defaultValue: 'Max {maxFiles} files, {maxFileSize}MB total. PDF, Word, Excel, Images',
                                    localized: true,
                                    admin: {
                                        description: 'Shown below the drop zone. Placeholders: {maxFiles}, {maxFileSize}.',
                                    },
                                },
                                {
                                    name: 'sizeError',
                                    type: 'text',
                                    label: 'Size Error',
                                    defaultValue: 'Total attachments would be {totalMB}MB. Maximum allowed is {maxFileSize}MB.',
                                    localized: true,
                                    admin: {
                                        description: 'Placeholders: {totalMB}, {maxFileSize}.',
                                    },
                                },
                                {
                                    name: 'countError',
                                    type: 'text',
                                    label: 'Count Error',
                                    defaultValue: 'Maximum {maxFiles} files allowed.',
                                    localized: true,
                                    admin: {
                                        description: 'Placeholders: {maxFiles}.',
                                    },
                                },
                            ],
                        },
                        {
                            name: 'recaptchaNotice',
                            type: 'text',
                            label: 'reCAPTCHA Notice',
                            defaultValue: 'This site is protected by reCAPTCHA.',
                            localized: true,
                            admin: {
                                description: 'Visible attribution shown when the reCAPTCHA badge is hidden. The word "reCAPTCHA" must remain as-is (Google trademark) in every locale. As of 2 April 2026 the notice must not link to Google\'s Privacy Policy or Terms. The frontend appends a link to the site\'s privacy-policy page (resolved from the page with pageType "privacy-policy").',
                            },
                        },
                        {
                            name: 'notifications',
                            type: 'group',
                            fields: [
                                {
                                    type: 'row',
                                    fields: [
                                        {
                                            name: 'success',
                                            type: 'text',
                                            defaultValue: 'Thank you! Your message has been sent successfully.',
                                            localized: true,
                                            admin: { width: '50%' },
                                        },
                                        {
                                            name: 'error',
                                            type: 'text',
                                            defaultValue: 'We\'re sorry, but we couldn\'t send your message. Please try again.',
                                            localized: true,
                                            admin: { width: '50%' },
                                        },
                                    ],
                                },
                                {
                                    type: 'row',
                                    fields: [
                                        {
                                            name: 'fileUploadError',
                                            type: 'text',
                                            defaultValue: 'File upload failed. Please check file type and size.',
                                            localized: true,
                                            admin: { width: '50%' },
                                        },
                                        {
                                            name: 'fileSizeError',
                                            type: 'text',
                                            defaultValue: 'File size exceeds the maximum limit.',
                                            localized: true,
                                            admin: { width: '50%' },
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    ],
}
