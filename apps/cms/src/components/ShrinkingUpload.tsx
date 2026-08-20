'use client'

import { Upload, useConfig, useDocumentInfo, useField } from '@payloadcms/ui'
import type { SanitizedCollectionConfig } from 'payload'
import { useCallback, useRef } from 'react'
import { shrinkImage } from '@svelteload/payload/uploads/shrinkImage'

export default function ShrinkingUpload() {
    const { collectionSlug } = useDocumentInfo()
    const { getEntityConfig } = useConfig()
    const { setValue } = useField<File>({ path: 'file' })
    const seen = useRef(new WeakSet<File>())

    const onChange = useCallback(
        async (file?: File) => {
            if (!file || seen.current.has(file)) return
            seen.current.add(file)

            const shrunk = await shrinkImage(file)
            if (shrunk === file) return

            seen.current.add(shrunk)
            setValue(shrunk)
        },
        [setValue],
    )

    if (!collectionSlug) return null

    const entityConfig = getEntityConfig({ collectionSlug }) as unknown as
        | { upload?: SanitizedCollectionConfig['upload'] }
        | undefined

    if (!entityConfig?.upload) return null

    return (
        <Upload
            collectionSlug={collectionSlug}
            uploadConfig={entityConfig.upload}
            onChange={onChange}
        />
    )
}
