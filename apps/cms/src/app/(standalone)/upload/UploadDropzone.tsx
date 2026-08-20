'use client'

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { shrinkImage } from '@svelteload/payload/uploads/shrinkImage'
import styles from './upload.module.css'

type Uploaded = { name: string; size: number; preview: string }
type Progress = { done: number; total: number }

export function UploadDropzone() {
    const [progress, setProgress] = useState<Progress | null>(null)
    const [failure, setFailure] = useState('')
    const [uploaded, setUploaded] = useState<Uploaded[]>([])
    const [dragging, setDragging] = useState(false)
    const [closeBlocked, setCloseBlocked] = useState(false)
    const previews = useRef<string[]>([])

    useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), [])

    async function upload(files: FileList | File[]) {
        if (progress) return
        const queue = Array.from(files)
        setProgress({ done: 0, total: queue.length })
        setFailure('')
        setCloseBlocked(false)
        try {
            for (const file of queue) {
                const shrunk = await shrinkImage(file)

                const body = new FormData()
                body.set('file', shrunk)

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

                const preview = URL.createObjectURL(shrunk)
                previews.current.push(preview)
                setUploaded((current) => [...current, { name: shrunk.name, size: shrunk.size, preview }])
                setProgress((current) => (current ? { ...current, done: current.done + 1 } : current))
            }
        } catch (err) {
            setFailure(err instanceof Error ? err.message : String(err))
        } finally {
            setProgress(null)
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

    function closeTab() {
        window.close()
        window.setTimeout(() => setCloseBlocked(true), 400)
    }

    const dropLabel = progress
        ? progress.total > 1
            ? `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
            : 'Uploading…'
        : uploaded.length
          ? 'Drop more images here, or click to choose'
          : 'Drop images here, or click to choose'

    const dropClasses = [styles.drop, dragging ? styles.dragging : '', progress ? styles.busy : '']
        .filter(Boolean)
        .join(' ')

    return (
        <main className={styles.page}>
            <div className={styles.panel}>
                <h1 className={styles.heading}>Upload images</h1>
                <p className={styles.intro}>
                    Anything you add here goes straight into the chat you came from.
                </p>

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
                    className={dropClasses}
                    onDragOver={(event) => {
                        event.preventDefault()
                        setDragging(true)
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                >
                    <span>{dropLabel}</span>
                </label>

                {failure && <div className={styles.error}>{failure}</div>}

                {uploaded.length > 0 && (
                    <>
                        <p className={styles.status}>
                            {uploaded.length} {uploaded.length === 1 ? 'image' : 'images'} added.
                        </p>
                        <ul className={styles.files}>
                            {uploaded.map((file, index) => (
                                <li key={`${file.name}-${index}`}>
                                    <img className={styles.thumb} src={file.preview} alt="" />
                                    <span className={styles.name}>{file.name}</span>
                                    <span className={styles.size}>{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                                </li>
                            ))}
                        </ul>

                        {!progress && (
                            <div className={styles.done}>
                                <p className={styles.next}>Drop more above if you have others.</p>
                                <button type="button" className={styles.close} onClick={closeTab}>
                                    Close this tab
                                </button>
                                {closeBlocked && (
                                    <p className={styles.hint}>
                                        Your browser will not let the page close itself. Close the tab the usual
                                        way and go back to the chat.
                                    </p>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </main>
    )
}
