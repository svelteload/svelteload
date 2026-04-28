import { createServerFeature } from '@payloadcms/richtext-lexical'

/**
 * Lexical feature that transforms pasted Unicode Mathematical Alphanumeric
 * Symbols (LinkedIn / Twitter "fake bold/italic" glyphs) back into real
 * bold/italic formatted text.
 */
export const UnicodeFormattingPasteFeature = createServerFeature({
    feature: {
        ClientFeature: '@cms/features/unicodeFormattingPaste/feature.client#UnicodeFormattingPasteClient',
    },
    key: 'unicodeFormattingPaste',
})
