import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getSchema } from '../schema.js'

export function registerGetSchema(server: McpServer) {
  server.tool(
    'get_schema',
    'Returns the full Payload CMS data model: all collections, globals, blocks, and fields with their types, localization flags, and relationships. Use this to understand the content structure before making queries or updates.',
    {},
    async () => ({
      content: [{ type: 'text', text: getSchema() }],
    }),
  )
}
