import { error } from '@sveltejs/kit'
import type { Payload } from 'payload'
import { getPayloadInstance } from './payload'
import { convertLexicalFieldsToHTML } from '../utils/lexicalConverter'

export type SectionHydrator = (args: {
    payload: Payload
    sections: any[] | undefined | null
    locale: string
    isDraft: boolean
}) => Promise<void>

const DEFAULT_MESSAGES: Record<string, string> = {
    en: 'Page not found',
    sv: 'Sidan hittades inte',
}

export async function throwNotFound({
    lang,
    isDraft,
    hydrate,
    message,
}: {
    lang?: string
    isDraft: boolean
    hydrate?: SectionHydrator
    message?: string
}): Promise<never> {
    const resolvedMessage =
        message ?? (lang && DEFAULT_MESSAGES[lang]) ?? DEFAULT_MESSAGES.en

    let page: any = null
    try {
        const payload = await getPayloadInstance()
        const result = await payload.find({
            collection: 'pages',
            ...(lang ? { locale: lang as any } : {}),
            where: { pageType: { equals: '404' } },
            draft: true,
            depth: 2,
            limit: 1,
        })
        if (result.docs.length > 0) {
            page = (await convertLexicalFieldsToHTML(result.docs[0])) as any
            if (hydrate) {
                await hydrate({
                    payload,
                    sections: page.sections,
                    locale: lang ?? 'en',
                    isDraft,
                })
            }
        }
    } catch {
        page = null
    }

    if (page) throw error(404, { message: resolvedMessage, page })
    throw error(404, { message: resolvedMessage })
}
