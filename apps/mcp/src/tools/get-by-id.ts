import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { PayloadClient } from '../client.js'

export function registerGetById(server: McpServer, client: PayloadClient) {
  server.tool(
    'get_by_id',
    'Get a single document by its ID from a Payload collection. Returns the full document with all fields.',
    {
      collection: z.string().describe('Collection slug (e.g. "pages", "blog", "menus", "media")'),
      id: z.string().describe('Document ID'),
      locale: z.string().optional().describe('Locale code (e.g. "en", "sv"). Defaults to "en".'),
      depth: z.number().optional().describe('Relationship population depth. 0 = IDs only.'),
    },
    async ({ collection, id, locale, depth }) => {
      const result = await client.findByID(collection, id, { locale, depth })
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      }
    },
  )
}
