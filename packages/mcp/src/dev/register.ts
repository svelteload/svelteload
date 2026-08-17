import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PayloadClient } from './client'
import { registerGetSchema } from './tools/get-schema'
import { registerFind } from './tools/find'
import { registerGetById } from './tools/get-by-id'
import { registerCreate } from './tools/create'
import { registerUpload } from './tools/upload'
import { registerUpdate } from './tools/update'
import { registerGetGlobal } from './tools/get-global'
import { registerUpdateGlobal } from './tools/update-global'
import { registerUpdateSection } from './tools/update-section'
import { registerBrowseMedia } from './tools/browse-media'

export const registerDevTools = (
    server: McpServer,
    client: PayloadClient,
    payloadUrl: string,
    projectConfig: Record<string, unknown>,
): void => {
    registerGetSchema(server, projectConfig)

    registerFind(server, client)
    registerGetById(server, client)
    registerCreate(server, client)
    registerUpload(server, client)
    registerUpdate(server, client)
    registerGetGlobal(server, client)
    registerUpdateGlobal(server, client)
    registerUpdateSection(server, client)
    registerBrowseMedia(server, payloadUrl)
}
