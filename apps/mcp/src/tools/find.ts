import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { PayloadClient } from '../client.js'

export function registerFind(server: McpServer, client: PayloadClient) {
  server.tool(
    'find',
    'Search documents in a Payload collection. Supports Payload where queries, pagination, sorting, and locale selection. Returns matching documents with pagination info.',
    {
      collection: z.string().describe('Collection slug (e.g. "pages", "blog", "menus", "media")'),
      where: z.record(z.string(), z.unknown()).optional().describe('Payload where query object (e.g. {"title":{"equals":"Home"}})'),
      locale: z.string().optional().describe('Locale code (e.g. "en", "sv"). Defaults to "en".'),
      depth: z.number().optional().describe('Relationship population depth. 0 = IDs only, 1 = one level. Default varies.'),
      limit: z.number().optional().describe('Max documents to return. Default 10.'),
      page: z.number().optional().describe('Page number for pagination.'),
      sort: z.string().optional().describe('Field to sort by. Prefix with "-" for descending (e.g. "-createdAt").'),
    },
    async ({ collection, where, locale, depth, limit, page, sort }) => {
      const result = await client.find(collection, { where, locale, depth, limit, page, sort })
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      }
    },
  )
}
