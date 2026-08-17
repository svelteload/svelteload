import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { PayloadClient, registerDevTools } from '@svelteload/mcp'
import { payloadConfigBase } from '@payload-config/payload-base.config'

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
} catch {}

const PAYLOAD_URL = process.env.PUBLIC_PAYLOAD_ADMIN_URL || 'http://localhost:3000'
const PAYLOAD_API_KEY = process.env.PAYLOAD_API_KEY || ''

if (!PAYLOAD_API_KEY) {
  console.error('Warning: PAYLOAD_API_KEY not set. CRUD operations will fail (schema tool still works).')
}

const server = new McpServer({
  name: 'payload-cms',
  version: '1.0.0',
})

registerDevTools(
  server,
  new PayloadClient(PAYLOAD_URL, PAYLOAD_API_KEY),
  PAYLOAD_URL,
  payloadConfigBase as unknown as Record<string, unknown>,
)

const transport = new StdioServerTransport()
await server.connect(transport)
