import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

/**
 * browse_media — Generate contact sheets of all media in the CMS.
 *
 * Calls the payload-admin /api/media-sheets endpoint, which renders every
 * uploaded image into paginated WebP contact sheets saved to disk.
 * Returns the file paths so Claude can Read them directly.
 *
 * Use this whenever you need to visually browse, search, or pick images.
 */
export function registerBrowseMedia(server: McpServer, payloadUrl: string) {
  server.tool(
    'browse_media',
    `Browse all images/media in the CMS visually. Generates contact sheets (grid previews) of every uploaded file and returns the file paths on disk.

Use this tool whenever you need to:
- See what images are available
- Pick images for a page, section, or blog post
- Find a specific image by appearance
- Get media IDs to use in content updates

After calling this tool, use the Read tool on each returned file path to view the contact sheets. Each image cell shows the media ID (e.g. #42) and filename — use the ID when referencing media in content updates.

Optional filters: search by filename/alt text, change chunk size (images per sheet).`,
    {
      search: z.string().optional().describe('Filter by filename or alt text'),
      chunk: z.number().optional().describe('Images per sheet (default: 48)'),
      sort: z.string().optional().describe('Sort field (default: "id"). Use "-createdAt" for newest first.'),
    },
    async ({ search, chunk, sort }) => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (chunk) params.set('chunk', String(chunk))
      if (sort) params.set('sort', sort)

      const url = `${payloadUrl}/api/media-sheets${params.size ? `?${params}` : ''}`

      let result: {
        totalDocs: number
        totalSheets: number
        chunkSize: number
        outDir: string
        sheets: string[]
      }

      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
        if (!res.ok) {
          const text = await res.text()
          return {
            content: [{ type: 'text', text: `Error from media-sheets endpoint (${res.status}): ${text}` }],
            isError: true,
          }
        }
        result = await res.json() as typeof result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: 'text', text: `Failed to reach ${url}: ${msg}\n\nThe payload-admin dev server must be running on localhost:3000. Start it with: pnpm --filter payload-admin dev` }],
          isError: true,
        }
      }

      const lines = [
        `Generated ${result.totalSheets} contact sheet(s) — ${result.totalDocs} total media items, ${result.chunkSize} per sheet.`,
        ``,
        `Use the Read tool on each path below to view the sheets:`,
        ...result.sheets.map((p, i) => `  Sheet ${i + 1}: ${p}`),
        ``,
        `Each cell shows the media ID (e.g. #42) and filename. Use the ID when referencing media in content updates.`,
      ]

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      }
    },
  )
}
