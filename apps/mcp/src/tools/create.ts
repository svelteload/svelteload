import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { PayloadClient } from '../client.js'

export function registerCreate(server: McpServer, client: PayloadClient) {
  server.tool(
    'create',
    'Create a new document in a Payload collection. Always saved as draft. For localized fields, set the locale parameter and provide values in that locale — call once per locale to set translations.',
    {
      collection: z.string().describe('Collection slug (e.g. "pages", "blog", "menus")'),
      data: z.record(z.string(), z.unknown()).describe('Document data matching the collection schema'),
      locale: z.string().optional().describe('Locale for localized fields (e.g. "en", "sv"). Defaults to "en".'),
    },
    async ({ collection, data, locale }) => {
      if ((data as any)._status === 'published') {
        return {
          content: [{
            type: 'text',
            text: 'ERROR: Publishing is not allowed via the MCP. Always save as draft (_status: "draft"). The site owner must review and publish content manually.',
          }],
          isError: true,
        }
      }
      const result = await client.create(collection, data, { locale })
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      }
    },
  )
}
