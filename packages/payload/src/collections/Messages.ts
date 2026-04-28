import type { CollectionConfig } from 'payload'
import { isAdmin } from '@cms/access/roles'

export const Messages: CollectionConfig = {
    slug: 'messages',
    labels: {
        singular: 'Message',
        plural: 'Messages',
    },
    admin: {
        useAsTitle: 'email',
        group: 'Admin',
        defaultColumns: ['email', 'fullName', 'status', 'createdAt'],
        description: 'Contact form submissions. Captured server-side after reCAPTCHA passes.',
        hidden: ({ user }) => {
            if (!user) return true
            return (user as { role?: string }).role !== 'admin'
        },
    },
    access: {
        read: isAdmin,
        create: () => true,
        update: isAdmin,
        delete: isAdmin,
    },
    fields: [
        {
            type: 'row',
            fields: [
                {
                    name: 'fullName',
                    type: 'text',
                    admin: { width: '50%' },
                },
                {
                    name: 'email',
                    type: 'email',
                    required: true,
                    index: true,
                    admin: { width: '50%' },
                },
            ],
        },
        {
            name: 'companyName',
            type: 'text',
        },
        {
            name: 'subjects',
            type: 'text',
            admin: {
                description: 'Comma-separated list of subjects selected on the form.',
            },
        },
        {
            name: 'message',
            type: 'textarea',
        },
        {
            name: 'status',
            type: 'select',
            required: true,
            defaultValue: 'sent',
            options: [
                { label: 'Sent', value: 'sent' },
                { label: 'Delivery failed', value: 'delivery_failed' },
            ],
            admin: {
                position: 'sidebar',
            },
        },
        {
            name: 'errorMessage',
            type: 'textarea',
            admin: {
                description: 'SendGrid error output when status is delivery_failed.',
                condition: (data) => data?.status === 'delivery_failed',
            },
        },
        {
            name: 'attachmentCount',
            type: 'number',
            defaultValue: 0,
            admin: { position: 'sidebar' },
        },
        {
            name: 'currentPage',
            type: 'text',
            admin: {
                description: 'Page the user was on when they submitted the form.',
            },
        },
        {
            name: 'userAgent',
            type: 'text',
        },
    ],
    timestamps: true,
}
