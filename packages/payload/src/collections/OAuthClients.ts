import type { CollectionConfig } from 'payload'
import { setAccess } from '@cms/access/roles'

export const OAuthClients: CollectionConfig = {
    slug: 'oauth-clients',
    labels: {
        singular: 'Connected App',
        plural: 'Connected Apps',
    },
    admin: {
        group: 'System',
        useAsTitle: 'clientName',
        defaultColumns: ['clientName', 'clientId', 'createdAt'],
        description: 'Apps registered through the MCP connector flow. Deleting a row revokes that app for everyone who connected through it.',
    },
    access: setAccess('admin'),
    fields: [
        {
            name: 'clientId',
            type: 'text',
            required: true,
            unique: true,
            index: true,
            admin: { readOnly: true },
        },
        {
            name: 'clientName',
            type: 'text',
            admin: { readOnly: true },
        },
        {
            name: 'redirectUris',
            type: 'array',
            admin: { readOnly: true },
            fields: [{ name: 'uri', type: 'text' }],
        },
        {
            name: 'tokenEndpointAuthMethod',
            type: 'text',
            defaultValue: 'none',
            admin: { readOnly: true },
        },
        {
            name: 'clientSecretHash',
            type: 'text',
            admin: { readOnly: true, hidden: true },
        },
    ],
}
