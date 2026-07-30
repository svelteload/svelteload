import type { CollectionConfig } from 'payload'
import { setAccess, getUserRole } from '@cms/access/roles'

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
            const role = getUserRole(user)
            return role !== 'admin' && role !== 'agent'
        },
    },
    access: { ...setAccess('agent'), create: () => true },
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
                description: 'Lettermint error output when status is delivery_failed.',
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
        },
        {
            name: 'userAgent',
            type: 'text',
        },
    ],
    timestamps: true,
}
