'use client'

import { createClientFeature } from '@payloadcms/richtext-lexical/client'

import { UnicodeFormattingPastePlugin } from './UnicodeFormattingPastePlugin'

export const UnicodeFormattingPasteClient = createClientFeature({
    plugins: [
        {
            Component: UnicodeFormattingPastePlugin,
            position: 'normal',
        },
    ],
})

export default UnicodeFormattingPasteClient
