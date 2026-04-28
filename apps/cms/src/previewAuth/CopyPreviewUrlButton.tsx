'use client'

import React, { useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

/**
 * Document-header action button for collections with live preview. Calls
 * GET /api/preview-url, gets back the same URL the live-preview iframe uses
 * (including the user's preview_key), and writes it to the clipboard.
 *
 * Hidden on new/unsaved documents (no id yet, no URL to build).
 *
 * Wired in automatically by previewAuthPlugin for every collection listed in
 * admin.livePreview.collections, so projects get this button without any
 * per-project config.
 */
export default function CopyPreviewUrlButton() {
  const { id, collectionSlug } = useDocumentInfo()
  const [state, setState] = useState<'idle' | 'loading' | 'copied' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!id || !collectionSlug) return null

  const handleClick = async () => {
    setState('loading')
    setErrorMessage(null)
    try {
      const res = await fetch(
        `/api/preview-url?collection=${encodeURIComponent(collectionSlug)}&id=${encodeURIComponent(String(id))}`,
      )
      const data = await res.json()
      if (!res.ok || !data.url) {
        setErrorMessage(data.error ?? 'Could not build preview URL')
        setState('error')
        return
      }
      await navigator.clipboard.writeText(data.url)
      setState('copied')
      setTimeout(() => setState('idle'), 2000)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error')
      setState('error')
    }
  }

  const title =
    state === 'loading' ? 'Copying...' :
    state === 'copied' ? 'Copied!' :
    state === 'error' ? (errorMessage ?? 'Error copying preview URL') :
    'Copy preview URL'

  return (
    <button
      aria-label={title}
      type="button"
      onClick={handleClick}
      disabled={state === 'loading'}
      className="preview-action-toggler"
      title={title}
    >
      {state === 'copied' ? (
        <svg className="icon icon--check" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
          <path className="stroke" d="M3.5 8.5 6.5 11.5 12.5 5"/>
        </svg>
      ) : (
        <svg className="icon icon--copy" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
          <rect className="stroke" x="5.5" y="5.5" width="8.5" height="9" rx="1"/>
          <path className="stroke" d="M3 11.5V3a1 1 0 0 1 1-1h7"/>
        </svg>
      )}
    </button>
  )
}
