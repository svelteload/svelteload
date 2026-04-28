'use client'

import React, { useEffect, useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

/**
 * Document-header action link for collections with live preview. Fetches
 * the preview URL once on mount and renders a plain `<a target="_blank">`
 * so clicks navigate instantly without a per-click roundtrip.
 *
 * Sits between the Copy preview URL button and Payload's native eye icon
 * for live-preview, giving editors a one-click way to see a draft on the
 * real preview subdomain in a fresh tab.
 */
export default function OpenPreviewSiteButton() {
  const { id, collectionSlug } = useDocumentInfo()
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id || !collectionSlug) return
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch(
          `/api/preview-url?collection=${encodeURIComponent(collectionSlug)}&id=${encodeURIComponent(String(id))}`,
        )
        const data = await res.json()
        if (cancelled) return
        if (!res.ok || !data.url) {
          setError(data.error ?? 'Could not build preview URL')
          return
        }
        setUrl(data.url)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Network error')
      }
    }

    void load()
    return () => { cancelled = true }
  }, [id, collectionSlug])

  if (!id || !collectionSlug) return null

  const icon = (
    <svg className="icon icon--external" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <path className="stroke" d="M9 2h5v5"/>
      <path className="stroke" d="M14 2 7.5 8.5"/>
      <path className="stroke" d="M12 9v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4"/>
    </svg>
  )

  if (url) {
    return (
      <a
        aria-label="Open preview site in new tab"
        title="Open preview site in new tab"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="preview-action-toggler"
      >
        {icon}
      </a>
    )
  }

  const title = error ?? 'Loading preview URL...'
  return (
    <button
      aria-label={title}
      type="button"
      disabled
      className="preview-action-toggler"
      title={title}
    >
      {icon}
    </button>
  )
}
