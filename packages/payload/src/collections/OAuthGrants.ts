import type { CollectionConfig } from 'payload'
import { setAccess } from '@cms/access/roles'

export const OAuthGrants: CollectionConfig = {
    slug: 'oauth-grants',
    labels: {
        singular: 'Connector Grant',
        plural: 'Connector Grants',
    },
    admin: {
        group: 'System',
        useAsTitle: 'clientId',
        defaultColumns: ['type', 'clientId', 'user', 'expiresAt'],
        description: 'Authorization codes and refresh tokens issued to connected apps. Deleting a refresh-token row signs that connection out.',
    },
    access: setAccess('admin'),
    fields: [
        {
            name: 'type',
            type: 'select',
            required: true,
            options: [
                { label: 'Authorization Code', value: 'code' },
                { label: 'Refresh Token', value: 'refresh' },
            ],
            admin: { readOnly: true },
        },
        {
            name: 'tokenHash',
            type: 'text',
            required: true,
            index: true,
            admin: { readOnly: true, hidden: true },
        },
        {
            name: 'clientId',
            type: 'text',
            required: true,
            index: true,
            admin: { readOnly: true },
        },
        {
            name: 'user',
            type: 'relationship',
            relationTo: 'users',
            required: true,
            admin: { readOnly: true },
        },
        {
            name: 'scope',
            type: 'text',
            admin: { readOnly: true },
        },
        {
            name: 'redirectUri',
            type: 'text',
            admin: { readOnly: true },
        },
        {
            name: 'codeChallenge',
            type: 'text',
            admin: { readOnly: true, hidden: true },
        },
        {
            name: 'resource',
            type: 'text',
            admin: { readOnly: true },
        },
        {
            name: 'expiresAt',
            type: 'date',
            required: true,
            index: true,
            admin: { readOnly: true },
        },
        {
            name: 'consumedAt',
            type: 'date',
            admin: { readOnly: true },
        },
    ],
}
