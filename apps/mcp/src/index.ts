import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { PayloadClient } from './client.js'
import { registerGetSchema } from './tools/get-schema.js'
import { registerFind } from './tools/find.js'
import { registerGetById } from './tools/get-by-id.js'
import { registerCreate } from './tools/create.js'
import { registerUpdate } from './tools/update.js'
import { registerGetGlobal } from './tools/get-global.js'
import { registerUpdateGlobal } from './tools/update-global.js'
import { registerUpdateSection } from './tools/update-section.js'
import { registerBrowseMedia } from './tools/browse-media.js'

// Load .env from the MCP app directory
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env')
try {
  const envFile = readFileSync(envPath, 'utf-8')
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
} catch {
  // .env file not found — fall back to process.env
}

// The MCP only targets the local payload-admin dev server. Contact-sheet
// generation (browse_media) is Sharp-heavy and would OOM/time-out on Vercel,
// and generated sheets are returned as local file paths anyway — so everything
// runs against http://localhost:3000. Start the admin with `pnpm --filter
// payload-admin dev` before using any tool other than `get_schema`.
const PAYLOAD_URL = 'http://localhost:3000'
const PAYLOAD_API_KEY = process.env.PAYLOAD_API_KEY || ''

if (!PAYLOAD_API_KEY) {
  console.error('Warning: PAYLOAD_API_KEY not set. CRUD operations will fail (schema tool still works).')
}

const client = new PayloadClient(PAYLOAD_URL, PAYLOAD_API_KEY)

const server = new McpServer({
  name: 'payload-cms',
  version: '1.0.0',
})

// Schema tool works without Payload running (reads config files)
registerGetSchema(server)

// CRUD tools require Payload running + API key
registerFind(server, client)
registerGetById(server, client)
registerCreate(server, client)
registerUpdate(server, client)
registerGetGlobal(server, client)
registerUpdateGlobal(server, client)
registerUpdateSection(server, client)
registerBrowseMedia(server, PAYLOAD_URL)

const transport = new StdioServerTransport()
await server.connect(transport)
