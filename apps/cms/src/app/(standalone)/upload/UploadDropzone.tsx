'use client'

import { useState, type ChangeEvent, type DragEvent } from 'react'
import { MAX_UPLOAD_DIMENSION } from '@svelteload/payload/imageSizes'
import styles from './upload.module.css'

const REENCODABLE = new Set(['image/jpeg', 'image/png', 'image/webp'])

type Uploaded = { name: string; size: number }

async function shrink(file: File): Promise<Blob> {
    if (!REENCODABLE.has(file.type)) return file

    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 3_000_000) return file

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), 'image/webp', 0.9))
}

export function UploadDropzone() {
    const [busy, setBusy] = useState(false)
    const [failure, setFailure] = useState('')
    const [uploaded, setUploaded] = useState<Uploaded[]>([])
    const [dragging, setDragging] = useState(false)

    async function upload(files: FileList | File[]) {
        if (busy) return
        setBusy(true)
        setFailure('')
        try {
            for (const file of Array.from(files)) {
                const shrunk = await shrink(file)
                const name = shrunk === file ? file.name : file.name.replace(/\.[^.]+$/, '') + '.webp'

                const body = new FormData()
                body.set('file', new File([shrunk], name, { type: shrunk.type || file.type }))

                const response = await fetch('/api/media', {
                    method: 'POST',
                    body,
                    credentials: 'include',
                })
                const result = await response.json()

                if (!response.ok) {
                    setFailure(
                        response.status === 403
                            ? 'This account is not allowed to add images. Ask whoever runs the site for access.'
                            : (result?.errors?.[0]?.message ?? 'The upload failed.'),
                    )
                    return
                }
                setUploaded((current) => [...current, { name, size: shrunk.size }])
            }
        } catch (err) {
            setFailure(err instanceof Error ? err.message : String(err))
        } finally {
            setBusy(false)
        }
    }

    function onChange(event: ChangeEvent<HTMLInputElement>) {
        const input = event.currentTarget
        if (input.files?.length) void upload(input.files)
        input.value = ''
    }

    function onDrop(event: DragEvent<HTMLLabelElement>) {
        event.preventDefault()
        setDragging(false)
        if (event.dataTransfer?.files?.length) void upload(event.dataTransfer.files)
    }

    return (
        <main className={styles.page}>
            <div className={styles.panel}>
                <h1 className={styles.heading}>Upload images</h1>

                <input
                    id="sl-files"
                    className={styles.picker}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={onChange}
                />
                <label
                    htmlFor="sl-files"
                    className={dragging ? `${styles.drop} ${styles.dragging}` : styles.drop}
                    onDragOver={(event) => {
                        event.preventDefault()
                        setDragging(true)
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                >
                    <span>{busy ? 'Uploading…' : 'Drop images here, or click to choose'}</span>
                </label>

                {uploaded.length > 0 && (
                    <>
                        <ul className={styles.files}>
                            {uploaded.map((file) => (
                                <li key={file.name}>
                                    <span className={styles.name}>{file.name}</span>
                                    <span className={styles.size}>{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                                </li>
                            ))}
                        </ul>
                        <p className={styles.done}>You can close this tab.</p>
                    </>
                )}

                {failure && <div className={styles.error}>{failure}</div>}
            </div>
        </main>
    )
}
