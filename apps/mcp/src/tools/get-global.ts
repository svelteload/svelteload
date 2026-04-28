import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { PayloadClient } from '../client.js'

export function registerGetGlobal(server: McpServer, client: PayloadClient) {
  server.tool(
    'get_global',
    'Get a Payload global document by slug. Globals are singleton documents like navbar, footer, company-info, blog-settings, contact-form, url-redirects.',
    {
      slug: z.string().describe('Global slug (e.g. "navbar", "footer", "company-info", "blog-settings", "contact-form", "url-redirects")'),
      locale: z.string().optional().describe('Locale code (e.g. "en", "sv"). Defaults to "en".'),
      depth: z.number().optional().describe('Relationship population depth. 0 = IDs only.'),
    },
    async ({ slug, locale, depth }) => {
      const result = await client.getGlobal(slug, { locale, depth })
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      }
    },
  )
}
