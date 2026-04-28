import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { PayloadClient } from '../client.js'

export function registerUpdateGlobal(server: McpServer, client: PayloadClient) {
  server.tool(
    'update_global',
    'Update a Payload global document. Always saved as draft. Only include the fields you want to change. For localized fields, set the locale parameter.',
    {
      slug: z.string().describe('Global slug (e.g. "navbar", "footer", "company-info")'),
      data: z.record(z.string(), z.unknown()).describe('Partial global data — only fields to change'),
      locale: z.string().optional().describe('Locale for localized fields (e.g. "en", "sv"). Defaults to "en".'),
    },
    async ({ slug, data, locale }) => {
      const result = await client.updateGlobal(slug, data, { locale })
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      }
    },
  )
}
