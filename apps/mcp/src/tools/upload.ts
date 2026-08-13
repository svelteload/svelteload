import { readFile, stat } from 'node:fs/promises'
import { basename, isAbsolute } from 'node:path'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { PayloadClient } from '../client.js'
import { mimeTypeForFilename } from '../mimeTypes.js'

const fileSchema = z.object({
  filePath: z.string().describe('Absolute path to the file on disk'),
  filename: z.string().optional().describe('Override the stored filename. Defaults to the name on disk.'),
  mimeType: z.string().optional().describe('Override the detected MIME type. Only needed for unusual extensions.'),
  data: z.record(z.string(), z.unknown()).optional().describe('Field values for the created document, e.g. {"alt": "..."}'),
})

export function registerUpload(server: McpServer, client: PayloadClient) {
  server.tool(
    'upload',
    `Upload one or more local files into an upload-enabled collection (usually "media").

Runs the identical server-side pipeline as uploading through the admin UI: filename sanitisation hooks, Sharp resizing into every configured image size, and storage-adapter upload. Image sizes come out the same as a UI upload.

Pass several entries in "files" to upload a batch in one call; they are processed in order and each result is reported separately, so a failure part-way through does not hide what already succeeded.

Files in "media" are served publicly from the project's media domain with no authentication. Anything that must not be reachable that way goes in "private-media" instead, which Payload serves only to signed-in CMS users. Stock image license documents and purchase receipts always belong there.

Returns the created document IDs and generated sizes. To attach an uploaded file to another document (e.g. setting a licenseDocument on an image), follow up with the update tool.`,
    {
      collection: z.string().optional().describe('Upload-enabled collection slug. Defaults to "media", which is public. Use "private-media" for license documents and anything else that must not be reachable from the web.'),
      files: z.array(fileSchema).min(1).describe('Files to upload, processed in order'),
      locale: z.string().optional().describe('Locale for localized fields (e.g. "en", "sv"). Defaults to "en".'),
    },
    async ({ collection, files, locale }) => {
      const slug = collection || 'media'

      for (const entry of files) {
        if ((entry.data as Record<string, unknown> | undefined)?._status === 'published') {
          return {
            content: [{
              type: 'text',
              text: 'ERROR: Publishing is not allowed via the MCP. Always save as draft (_status: "draft"). The site owner must review and publish content manually.',
            }],
            isError: true,
          }
        }
      }

      const lines: string[] = []
      let failed = 0

      for (const entry of files) {
        const label = entry.filePath

        try {
          if (!isAbsolute(entry.filePath)) {
            throw new Error('filePath must be absolute')
          }

          const info = await stat(entry.filePath)
          if (!info.isFile()) {
            throw new Error('not a file')
          }

          const filename = entry.filename || basename(entry.filePath)
          const mimeType = entry.mimeType || mimeTypeForFilename(filename)
          if (!mimeType) {
            throw new Error(`could not detect a MIME type for "${filename}". Pass mimeType explicitly.`)
          }

          const buffer = await readFile(entry.filePath)

          const doc = await client.upload(
            slug,
            { data: new Uint8Array(buffer), filename, mimeType },
            entry.data ?? {},
            { locale },
          )

          const created = (doc.doc ?? doc) as Record<string, unknown>
          const sizes = created.sizes as Record<string, { filename?: string | null }> | undefined
          const generated = sizes
            ? Object.entries(sizes).filter(([, v]) => v?.filename).map(([k]) => k)
            : []

          lines.push(
            `OK  ${label}`,
            `    id: ${created.id}  filename: ${created.filename}  mimeType: ${created.mimeType}  ${created.width ?? '?'}x${created.height ?? '?'}  ${created.filesize ?? '?'} bytes`,
            `    sizes: ${generated.length ? generated.join(', ') : 'none'}`,
          )
        } catch (err) {
          failed++
          const msg = err instanceof Error ? err.message : String(err)
          lines.push(`FAILED  ${label}`, `    ${msg}`)
        }
      }

      const succeeded = files.length - failed
      lines.unshift(`Uploaded ${succeeded}/${files.length} file(s) to "${slug}".`, '')

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        isError: failed > 0,
      }
    },
  )
}
