import { createServerFeature } from '@payloadcms/richtext-lexical'

export const UnicodeFormattingPasteFeature = createServerFeature({
    feature: {
        ClientFeature: '@cms/features/unicodeFormattingPaste/feature.client#UnicodeFormattingPasteClient',
    },
    key: 'unicodeFormattingPaste',
})
