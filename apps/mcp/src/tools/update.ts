import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { PayloadClient } from '../client.js'

export function registerUpdate(server: McpServer, client: PayloadClient) {
  server.tool(
    'update',
    'Update an existing document in a Payload collection. Always saved as draft. Only include the fields you want to change — other fields are preserved. For localized fields, set the locale parameter.',
    {
      collection: z.string().describe('Collection slug (e.g. "pages", "blog", "menus")'),
      id: z.string().describe('Document ID to update'),
      data: z.record(z.string(), z.unknown()).describe('Partial document data — only fields to change'),
      locale: z.string().optional().describe('Locale for localized fields (e.g. "en", "sv"). Defaults to "en".'),
    },
    async ({ collection, id, data, locale }) => {
      if ((data as any)._status === 'published') {
        return {
          content: [{
            type: 'text',
            text: 'ERROR: Publishing is not allowed via the MCP. Always save as draft (_status: "draft"). The site owner must review and publish content manually.',
          }],
          isError: true,
        }
      }
      const result = await client.update(collection, id, data, { locale })
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      }
    },
  )
}
