import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { PayloadClient } from '../client.js'

export function registerUpdateSection(server: McpServer, client: PayloadClient) {
  server.tool(
    'update_section',
    'Update a single section (block) within a page without touching other sections. Fetches the page, merges your changes into the target section, and saves as draft. Identify the section by index (0-based) or by its sectionId field.',
    {
      page_id: z.string().describe('Page document ID'),
      section_index: z.number().optional().describe('0-based index of the section to update'),
      section_id: z.string().optional().describe('The sectionId field value to match (alternative to section_index)'),
      data: z.record(z.string(), z.unknown()).describe('Partial section data to merge — only fields to change. Do NOT include blockType.'),
      locale: z.string().optional().describe('Locale for localized fields (e.g. "en", "sv"). Defaults to "en".'),
    },
    async ({ page_id, section_index, section_id, data, locale }) => {
      if (section_index === undefined && !section_id) {
        return {
          content: [{ type: 'text', text: 'Error: provide either section_index or section_id' }],
          isError: true,
        }
      }

      // Fetch current page
      const page = await client.findByID('pages', page_id, { locale, depth: 0 })
      const sections = page.sections as Record<string, unknown>[]

      if (!sections || !Array.isArray(sections)) {
        return {
          content: [{ type: 'text', text: 'Error: page has no sections array' }],
          isError: true,
        }
      }

      // Find target section
      let targetIndex: number
      if (section_index !== undefined) {
        targetIndex = section_index
      } else {
        targetIndex = sections.findIndex(s => s.sectionId === section_id)
        if (targetIndex === -1) {
          const available = sections.map((s, i) => `${i}: ${s.blockType} (sectionId: ${s.sectionId || 'none'})`).join('\n')
          return {
            content: [{ type: 'text', text: `Error: no section with sectionId "${section_id}". Available:\n${available}` }],
            isError: true,
          }
        }
      }

      if (targetIndex < 0 || targetIndex >= sections.length) {
        return {
          content: [{ type: 'text', text: `Error: section_index ${targetIndex} out of range (0-${sections.length - 1})` }],
          isError: true,
        }
      }

      // Merge data into target section (shallow merge — arrays are replaced, not appended)
      const updatedSection = { ...sections[targetIndex], ...data }
      const updatedSections = [...sections]
      updatedSections[targetIndex] = updatedSection

      // Save
      const result = await client.update('pages', page_id, { sections: updatedSections }, { locale })

      const savedSections = (result as Record<string, unknown>).sections as Record<string, unknown>[]
      const savedSection = savedSections?.[targetIndex]

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: `Updated section ${targetIndex} (${updatedSection.blockType})`,
            section: savedSection,
          }, null, 2),
        }],
      }
    },
  )
}
