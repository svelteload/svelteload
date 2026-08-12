'use client'

import React, { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ContentDocument, ContentField, ReviewNote } from './fetchContent'
import { markDocumentReviewed, unmarkDocumentReviewed, saveDocumentEdits, fetchDocumentDiff } from './actions'
import type { FieldEdit } from './actions'
import type { DocumentDiff } from './diff'
import { DiffPanel } from './DiffView'

type Props = {
  documents: ContentDocument[]
  localeCodes: string[]
  initialNotes: Record<string, ReviewNote>
}

type ReviewStatus = 'reviewed' | 'draft' | 'new'

function getReviewStatus(doc: ContentDocument, notes: Record<string, ReviewNote>): ReviewStatus {
  if (doc.docStatus === 'draft') return 'draft'
  const note = notes[doc.docKey]
  if (!note) return 'new'
  return 'reviewed'
}

// Reviewing a document accepts its gaps as intentional (content that only runs in one locale).
function isAcknowledged(doc: ContentDocument, notes: Record<string, ReviewNote>): boolean {
  return getReviewStatus(doc, notes) === 'reviewed'
}

function flagsMissing(field: ContentField, acknowledged: boolean): boolean {
  return field.isMissing && !acknowledged
}

function flagsWarning(field: ContentField, acknowledged: boolean): boolean {
  return field.isWarning && !field.isMissing && !acknowledged
}

const STYLES = `
  .cr-row { cursor: pointer; border-left: 3px solid transparent; transition: background 0.1s; }
  .cr-row:hover { background: rgba(255,255,255,0.03); }
  .cr-row-marked { border-left: 3px solid #f59e0b !important; background: rgba(245, 158, 11, 0.06) !important; }
  .cr-row-marked:hover { background: rgba(245, 158, 11, 0.1) !important; }
  .cr-row-missing { border-left: 3px solid #ef4444 !important; background: rgba(239, 68, 68, 0.05) !important; }
  .cr-row-missing:hover { background: rgba(239, 68, 68, 0.09) !important; }
  .cr-row-warning { border-left: 3px solid #ca8a04 !important; background: rgba(202, 138, 4, 0.04) !important; }
  .cr-row-warning:hover { background: rgba(202, 138, 4, 0.08) !important; }
  .cr-row-marked.cr-row-missing { border-left: 3px solid #f59e0b !important; background: rgba(245, 158, 11, 0.1) !important; }
  .cr-row-marked.cr-row-warning { border-left: 3px solid #f59e0b !important; background: rgba(245, 158, 11, 0.1) !important; }
`

function getDocKey(doc: ContentDocument): string {
  return doc.type === 'collection'
    ? `col:${doc.collection}:::${doc.documentId}`
    : `glob:${doc.globalSlug}`
}

function makeFieldKey(docKey: string, fieldPath: string): string {
  return `${docKey}|||${fieldPath}`
}

const selectStyle: React.CSSProperties = {
  background: 'var(--theme-elevation-100, #222)',
  border: '1px solid var(--theme-elevation-200, #333)',
  color: 'var(--theme-text, #eee)',
  borderRadius: '3px',
  padding: '4px 8px',
  fontSize: '13px',
  cursor: 'pointer',
}

const thStyle: React.CSSProperties = {
  padding: '6px 12px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--theme-elevation-500)',
  borderRight: '1px solid var(--theme-elevation-100, #222)',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  verticalAlign: 'top',
  borderRight: '1px solid var(--theme-elevation-100, #222)',
  lineHeight: '1.6',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

function DocumentCard({
  doc,
  localeA,
  localeB,
  markedFields,
  onToggleMark,
  showMode,
  reviewStatus,
  onToggleReviewed,
  isPending,
  isEditing,
  currentEdits,
  onEditChange,
  onSave,
  onCancelEdit,
  onStartEdit,
  isSaving,
  diffState,
  onToggleDiff,
}: {
  doc: ContentDocument
  localeA: string
  localeB: string
  markedFields: Set<string>
  onToggleMark: (key: string) => void
  showMode: 'all' | 'missing' | 'warnings' | 'marked'
  reviewStatus: ReviewStatus
  onToggleReviewed: (doc: ContentDocument) => void
  isPending: boolean
  isEditing: boolean
  currentEdits: Record<string, string>
  onEditChange: (editKey: string, value: string) => void
  onSave: () => void
  onCancelEdit: () => void
  onStartEdit: () => void
  isSaving: boolean
  diffState: { status: 'closed' | 'loading' | 'open' | 'error'; diff?: DocumentDiff; error?: string }
  onToggleDiff: () => void
}) {
  const docKey = doc.docKey
  const collectionLabel =
    doc.type === 'collection'
      ? doc.collectionLabel ?? doc.collection
      : `Global: ${doc.globalLabel ?? doc.globalSlug}`

  const docHasMarked = doc.fields.some((f) => markedFields.has(makeFieldKey(docKey, f.path)))
  const fieldIsEditable = (fieldPath: string) =>
    isEditing && !docHasMarked || (isEditing && markedFields.has(makeFieldKey(docKey, fieldPath)))

  const acknowledged = reviewStatus === 'reviewed'

  const visibleFields = doc.fields.filter((f) => {
    if (showMode === 'missing') return flagsMissing(f, acknowledged)
    if (showMode === 'warnings') return flagsWarning(f, acknowledged)
    if (showMode === 'marked') return markedFields.has(makeFieldKey(docKey, f.path))
    return true
  })

  const markedCount = doc.fields.filter((f) => markedFields.has(makeFieldKey(docKey, f.path))).length
  const missingCount = doc.fields.filter((f) => flagsMissing(f, acknowledged)).length
  const warningCount = doc.fields.filter((f) => flagsWarning(f, acknowledged)).length
  const acceptedCount = acknowledged
    ? doc.fields.filter((f) => f.isMissing || f.isWarning).length
    : 0

  const displayLocales = localeA === localeB ? [localeA] : [localeA, localeB]

  return (
    <div
      style={{
        marginBottom: '20px',
        border: '1px solid var(--theme-elevation-150, #2a2a2a)',
        borderRadius: '4px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: 'var(--theme-elevation-50, #1a1a1a)',
          borderBottom: '1px solid var(--theme-elevation-150, #2a2a2a)',
        }}
      >
        <div>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--theme-elevation-400)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {collectionLabel}
          </span>
          <h3
            style={{
              margin: '2px 0 0',
              fontSize: '14px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            {doc.documentTitle}
            {missingCount > 0 && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#ef4444',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '10px',
                  padding: '1px 7px',
                }}
              >
                {missingCount} missing
              </span>
            )}
            {warningCount > 0 && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#ca8a04',
                  background: 'rgba(202, 138, 4, 0.1)',
                  border: '1px solid rgba(202, 138, 4, 0.3)',
                  borderRadius: '10px',
                  padding: '1px 7px',
                }}
              >
                {warningCount} warnings
              </span>
            )}
            {markedCount > 0 && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#f59e0b',
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '10px',
                  padding: '1px 7px',
                }}
              >
                {markedCount} marked
              </span>
            )}
            {reviewStatus === 'reviewed' && (
              <span
                style={{ fontSize: '11px', fontWeight: 500, color: '#4ade80', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: '10px', padding: '1px 7px' }}
                title={acceptedCount > 0 ? 'Gaps in this document are accepted as intentional' : undefined}
              >
                ✓ reviewed{acceptedCount > 0 ? ` · ${acceptedCount} accepted` : ''}
              </span>
            )}
            {reviewStatus === 'draft' && (
              <span style={{ fontSize: '11px', fontWeight: 500, color: '#60a5fa', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: '10px', padding: '1px 7px' }}>
                Draft
              </span>
            )}
          </h3>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
          {isEditing ? (
            <>
              <button
                type="button"
                disabled={isSaving}
                onClick={onSave}
                style={{
                  fontSize: '12px',
                  color: isSaving ? 'var(--theme-elevation-400)' : '#4ade80',
                  background: 'transparent',
                  border: `1px solid ${isSaving ? 'var(--theme-elevation-200)' : 'rgba(74,222,128,0.4)'}`,
                  borderRadius: '3px',
                  padding: '4px 10px',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.6 : 1,
                }}
              >
                {isSaving ? 'Publishing…' : '✓ Save & Publish'}
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={onCancelEdit}
                style={{
                  ...selectStyle,
                  fontSize: '12px',
                  opacity: isSaving ? 0.4 : 1,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={() => onToggleReviewed(doc)}
                style={{
                  fontSize: '12px',
                  color: reviewStatus === 'reviewed' ? '#4ade80' : 'var(--theme-elevation-500)',
                  background: 'transparent',
                  border: `1px solid ${reviewStatus === 'reviewed' ? 'rgba(74,222,128,0.4)' : 'var(--theme-elevation-200)'}`,
                  borderRadius: '3px',
                  padding: '4px 8px',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  opacity: isPending ? 0.5 : 1,
                  transition: 'color 0.15s, border-color 0.15s',
                }}
                title={
                  reviewStatus === 'reviewed'
                    ? 'Unmark to bring this document back into the review queue'
                    : 'Accepts any missing translations here as intentional and clears the document from the queue'
                }
              >
                {reviewStatus === 'reviewed'
                  ? '✓ Reviewed'
                  : doc.docStatus === 'draft'
                  ? 'Mark Reviewed & Publish'
                  : 'Mark Reviewed'}
              </button>
              {doc.docStatus === 'draft' && (
                <button
                  type="button"
                  onClick={onToggleDiff}
                  disabled={diffState.status === 'loading'}
                  style={{
                    ...selectStyle,
                    fontSize: '12px',
                    color: diffState.status === 'open' ? '#60a5fa' : 'var(--theme-text, #eee)',
                    border: `1px solid ${diffState.status === 'open' ? 'rgba(96,165,250,0.4)' : 'var(--theme-elevation-200, #333)'}`,
                    cursor: diffState.status === 'loading' ? 'wait' : 'pointer',
                  }}
                  title="Show what changed since last publish"
                >
                  {diffState.status === 'loading'
                    ? 'Loading…'
                    : diffState.status === 'open'
                    ? 'Hide edits'
                    : 'View edits'}
                </button>
              )}
              <button
                type="button"
                onClick={onStartEdit}
                style={{
                  ...selectStyle,
                  fontSize: '12px',
                  color: docHasMarked ? '#f59e0b' : 'var(--theme-text, #eee)',
                  border: `1px solid ${docHasMarked ? 'rgba(245,158,11,0.4)' : 'var(--theme-elevation-200, #333)'}`,
                }}
                title={docHasMarked ? 'Edit marked fields only' : 'Edit all fields'}
              >
                {docHasMarked ? '✎ Edit marked' : '✎ Edit'}
              </button>
              <a
                href={doc.editUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '12px',
                  color: 'var(--theme-elevation-500)',
                  textDecoration: 'none',
                  padding: '4px 8px',
                  border: '1px solid var(--theme-elevation-200)',
                  borderRadius: '3px',
                }}
              >
                CMS ↗
              </a>
            </>
          )}
        </div>
      </div>

      {diffState.status === 'open' && diffState.diff && <DiffPanel diff={diffState.diff} />}
      {diffState.status === 'error' && (
        <div
          style={{
            padding: '12px 16px',
            fontSize: '12px',
            color: 'var(--theme-error-500, #dc3545)',
            background: 'var(--theme-error-100, rgba(220,53,69,0.08))',
            borderBottom: '1px solid var(--theme-elevation-150, #2a2a2a)',
          }}
        >
          ✕ Could not load diff: {diffState.error}
        </div>
      )}

      {visibleFields.length === 0 ? (
        <div style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--theme-elevation-400)' }}>
          No text content.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ background: 'var(--theme-elevation-25, #161616)' }}>
              <th style={{ ...thStyle, width: '180px' }}>Field</th>
              {displayLocales.map((locale, i) => (
                <th
                  key={locale}
                  style={i === displayLocales.length - 1 ? { ...thStyle, borderRight: 'none' } : thStyle}
                >
                  {locale.toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleFields.map((field, i) => {
              const fieldKey = makeFieldKey(docKey, field.path)
              const isMarked = markedFields.has(fieldKey)
              const showsMissing = flagsMissing(field, acknowledged)
              const showsWarning = flagsWarning(field, acknowledged)
              const aVal = field.values[localeA] ?? ''
              const bVal = field.values[localeB] ?? ''
              const same = displayLocales.length > 1 && aVal === bVal && !showsMissing

              let rowClass = 'cr-row'
              if (isMarked) rowClass += ' cr-row-marked'
              else if (showsMissing) rowClass += ' cr-row-missing'
              else if (showsWarning) rowClass += ' cr-row-warning'

              const pathColor = showsMissing
                ? '#ef4444'
                : showsWarning
                ? '#ca8a04'
                : 'var(--theme-elevation-500)'

              return (
                <tr
                  key={i}
                  className={rowClass}
                  onClick={(e) => {
                    if (window.getSelection()?.toString().length) return
                    if ((e.target as HTMLElement).tagName === 'TEXTAREA') return
                    if (isEditing) return
                    onToggleMark(fieldKey)
                  }}
                  style={{ borderTop: '1px solid var(--theme-elevation-100, #222)' }}
                  title={isMarked ? 'Click to unmark' : 'Click to mark for edit'}
                >
                  <td
                    style={{
                      ...tdStyle,
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      color: pathColor,
                      width: '180px',
                      maxWidth: '180px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={field.warningNote ? `${field.path} — ${field.warningNote}` : field.path}
                  >
                    {field.path}
                    {showsMissing && <span style={{ marginLeft: '5px', opacity: 0.7 }}>⚠</span>}
                    {showsWarning && <span style={{ marginLeft: '5px', opacity: 0.7 }}>~</span>}
                  </td>

                  {field.singleValue !== undefined ? (
                    <td
                      colSpan={displayLocales.length}
                      style={{
                        ...tdStyle,
                        borderRight: 'none',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        color: showsMissing ? 'rgba(239,68,68,0.7)' : 'var(--theme-elevation-600)',
                      }}
                    >
                      {field.singleValue}
                    </td>
                  ) : (
                    <>
                      {displayLocales.map((locale, colIdx) => {
                        const val = field.values[locale] ?? ''
                        const editKey = `${locale}:::${field.path}`
                        const editedVal = currentEdits[editKey]
                        const displayVal = editedVal !== undefined ? editedVal : val
                        const canEdit = fieldIsEditable(field.path) && field.fieldType !== undefined && field.path !== 'localizedPaths'
                        const isLastCol = colIdx === displayLocales.length - 1

                        if (canEdit) {
                          const editDefault = editedVal !== undefined
                            ? editedVal
                            : (field.editValues?.[locale] ?? val)
                          const isRich = field.fieldType === 'richText'
                          const taStyle: React.CSSProperties = {
                            display: 'block',
                            width: '100%',
                            padding: 0,
                            margin: 0,
                            background: 'rgba(255,255,255,0.04)',
                            border: 'none',
                            borderRadius: '2px',
                            color: 'var(--theme-text, #eee)',
                            fontFamily: isRich ? 'monospace' : 'inherit',
                            fontSize: '13px',
                            lineHeight: '1.6',
                            resize: 'none',
                            overflow: 'hidden',
                            boxSizing: 'border-box',
                            outline: 'none',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }
                          return (
                            <td
                              key={locale}
                              style={{
                                ...tdStyle,
                                borderRight: isLastCol ? 'none' : tdStyle.borderRight,
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <textarea
                                ref={(el) => {
                                  if (el) {
                                    el.style.height = 'auto'
                                    el.style.height = el.scrollHeight + 'px'
                                  }
                                }}
                                value={editDefault}
                                onChange={(e) => {
                                  onEditChange(editKey, e.target.value)
                                  e.target.style.height = 'auto'
                                  e.target.style.height = e.target.scrollHeight + 'px'
                                }}
                                placeholder={isRich
                                  ? '# Heading 1\n## Heading 2\n\n__bold__ _italic_ ___both___\n~~strike~~ `code`\n[link text](https://url)\n- bullet\n1. ordered'
                                  : ''}
                                rows={1}
                                style={taStyle}
                              />
                            </td>
                          )
                        }

                        const isMuted = isEditing && !canEdit
                        return (
                          <td
                            key={locale}
                            style={{
                              ...tdStyle,
                              borderRight: isLastCol ? 'none' : tdStyle.borderRight,
                              color: !val && showsMissing
                                ? 'rgba(239,68,68,0.5)'
                                : isLastCol && same && !showsWarning
                                ? 'var(--theme-elevation-500)'
                                : isMuted
                                ? 'var(--theme-elevation-300)'
                                : !val
                                ? 'var(--theme-elevation-400)'
                                : undefined,
                              fontStyle: !val ? 'italic' : undefined,
                              opacity: isMuted ? 0.5 : undefined,
                            }}
                          >
                            {val || (field.isMissing ? 'empty' : '')}
                            {isLastCol && showsWarning && field.warningNote && (
                              <span style={{ display: 'block', fontSize: '11px', color: '#ca8a04', opacity: 0.8, marginTop: '2px' }}>
                                {field.warningNote}
                              </span>
                            )}
                          </td>
                        )
                      })}
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

type ShowMode = 'all' | 'missing' | 'warnings' | 'marked'

export function ContentReviewList({ documents, localeCodes, initialNotes }: Props) {
  const router = useRouter()
  const [localeA, setLocaleA] = useState(localeCodes[0] ?? 'en')
  const [localeB, setLocaleB] = useState(localeCodes[1] ?? localeCodes[0] ?? 'en')
  const [filterKey, setFilterKey] = useState('new')
  const [markedFields, setMarkedFields] = useState(new Set<string>())
  const [showMode, setShowMode] = useState<ShowMode>('all')
  const [notes, setNotes] = useState<Record<string, ReviewNote>>(initialNotes)
  const [pendingKeys, setPendingKeys] = useState(new Set<string>())
  const [, startTransition] = useTransition()
  const [editingDocKey, setEditingDocKey] = useState<string | null>(null)
  const [currentEdits, setCurrentEdits] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [diffStates, setDiffStates] = useState<
    Record<string, { status: 'closed' | 'loading' | 'open' | 'error'; diff?: DocumentDiff; error?: string }>
  >({})

  const handleToggleDiff = async (doc: ContentDocument) => {
    const key = doc.docKey
    const current = diffStates[key] ?? { status: 'closed' as const }
    if (current.status === 'open') {
      setDiffStates((prev) => ({ ...prev, [key]: { status: 'closed' } }))
      return
    }
    if (current.diff) {
      setDiffStates((prev) => ({ ...prev, [key]: { status: 'open', diff: current.diff } }))
      return
    }
    setDiffStates((prev) => ({ ...prev, [key]: { status: 'loading' } }))
    try {
      const diff = await fetchDocumentDiff(key)
      setDiffStates((prev) => ({ ...prev, [key]: { status: 'open', diff } }))
    } catch (err) {
      setDiffStates((prev) => ({
        ...prev,
        [key]: { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' },
      }))
    }
  }

  const handleToggleMark = (key: string) => {
    setMarkedFields((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleToggleReviewed = (doc: ContentDocument) => {
    const key = doc.docKey
    const isReviewed = !!notes[key] && getReviewStatus(doc, notes) === 'reviewed'
    setPendingKeys((prev) => new Set(prev).add(key))
    startTransition(async () => {
      try {
        if (isReviewed) {
          await unmarkDocumentReviewed(key)
          setNotes((prev) => {
            const next = { ...prev }
            delete next[key]
            return next
          })
        } else {
          const shouldPublish = doc.docStatus === 'draft'
          const { updatedAt } = await markDocumentReviewed(
            key,
            doc.docUpdatedAt,
            shouldPublish,
          )
          setNotes((prev) => ({
            ...prev,
            [key]: { key, docUpdatedAt: updatedAt },
          }))
          if (shouldPublish) {
            setDiffStates((prev) => {
              const next = { ...prev }
              delete next[key]
              return next
            })
            router.refresh()
          }
        }
      } finally {
        setPendingKeys((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    })
  }

  const handleStartEdit = (docKey: string) => {
    setEditingDocKey(docKey)
    setCurrentEdits({})
  }

  const handleCancelEdit = () => {
    setEditingDocKey(null)
    setCurrentEdits({})
  }

  const handleEditChange = (editKey: string, value: string) => {
    setCurrentEdits((prev) => ({ ...prev, [editKey]: value }))
  }

  const handleSave = async (doc: ContentDocument) => {
    setIsSaving(true)
    try {
      const editsByLocale: Record<string, FieldEdit[]> = {}
      for (const [editKey, value] of Object.entries(currentEdits)) {
        const sepIdx = editKey.indexOf(':::')
        if (sepIdx === -1) continue
        const locale = editKey.slice(0, sepIdx)
        const path = editKey.slice(sepIdx + 3)
        const fieldType = doc.fields.find((f) => f.path === path)?.fieldType ?? 'text'
        ;(editsByLocale[locale] ??= []).push({ path, value, fieldType })
      }
      const { updatedAt } = await saveDocumentEdits(doc.docKey, editsByLocale)
      await markDocumentReviewed(doc.docKey, updatedAt)
      setNotes((prev) => ({
        ...prev,
        [doc.docKey]: { key: doc.docKey, docUpdatedAt: updatedAt },
      }))
      setDiffStates((prev) => {
        const next = { ...prev }
        delete next[doc.docKey]
        return next
      })
      setEditingDocKey(null)
      setCurrentEdits({})
      router.refresh()
    } finally {
      setIsSaving(false)
    }
  }

  const groupOptions = useMemo(() => {
    const seen = new Set<string>()
    const opts: Array<{ key: string; label: string }> = []
    for (const doc of documents) {
      const key = doc.type === 'collection' ? `col:${doc.collection}` : `glob:${doc.globalSlug}`
      if (!seen.has(key)) {
        seen.add(key)
        opts.push({
          key,
          label:
            doc.type === 'collection'
              ? (doc.collectionLabel ?? doc.collection ?? '')
              : `[Global] ${doc.globalLabel ?? doc.globalSlug ?? ''}`,
        })
      }
    }
    return opts
  }, [documents])

  const newCount = useMemo(
    () => documents.filter((doc) => !isAcknowledged(doc, notes)).length,
    [documents, notes],
  )

  const draftCount = useMemo(
    () => documents.filter((doc) => doc.docStatus === 'draft').length,
    [documents],
  )

  const filtered = useMemo(() => {
    if (filterKey === 'all' || filterKey === 'new' || filterKey === 'drafts') return documents
    return documents.filter((doc) => {
      const key = doc.type === 'collection' ? `col:${doc.collection}` : `glob:${doc.globalSlug}`
      return key === filterKey
    })
  }, [documents, filterKey])

  const displayDocs = useMemo(() => {
    if (showMode === 'all') return filtered
    if (showMode === 'missing')
      return filtered.filter((doc) => doc.fields.some((f) => flagsMissing(f, isAcknowledged(doc, notes))))
    if (showMode === 'warnings')
      return filtered.filter((doc) => doc.fields.some((f) => flagsWarning(f, isAcknowledged(doc, notes))))
    return filtered.filter((doc) => {
      const docKey = getDocKey(doc)
      return doc.fields.some((f) => markedFields.has(makeFieldKey(docKey, f.path)))
    })
  }, [filtered, markedFields, showMode, notes])

  const visibleDocs = useMemo(() => {
    if (filterKey === 'drafts') return displayDocs.filter((doc) => doc.docStatus === 'draft')
    if (filterKey !== 'new') return displayDocs
    return displayDocs.filter((doc) => !isAcknowledged(doc, notes))
  }, [displayDocs, filterKey, notes])

  const markedCount = markedFields.size
  const totalMissing = documents.reduce(
    (sum, doc) => sum + doc.fields.filter((f) => flagsMissing(f, isAcknowledged(doc, notes))).length,
    0,
  )
  const totalWarnings = documents.reduce(
    (sum, doc) => sum + doc.fields.filter((f) => flagsWarning(f, isAcknowledged(doc, notes))).length,
    0,
  )

  const handleExportAll = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      locales: localeCodes,
      documents: filtered.map((doc) => ({
        title: doc.documentTitle,
        type: doc.type,
        source: doc.collection ?? doc.globalSlug,
        editUrl: doc.editUrl,
        fields: doc.fields.map((f) => {
          const entry: Record<string, string> = { path: f.path }
          for (const code of localeCodes) entry[code] = f.values[code] ?? ''
          return entry
        }),
      })),
    }
    downloadJson(data, `content-review-${new Date().toISOString().slice(0, 10)}.json`)
  }

  const handleExportMarked = () => {
    const markedDocs = documents.filter((doc) => {
      const docKey = getDocKey(doc)
      return doc.fields.some((f) => markedFields.has(makeFieldKey(docKey, f.path)))
    })
    const data = {
      exportedAt: new Date().toISOString(),
      locales: localeCodes,
      markedForEdit: true,
      documents: markedDocs.map((doc) => {
        const docKey = getDocKey(doc)
        return {
          title: doc.documentTitle,
          type: doc.type,
          source: doc.collection ?? doc.globalSlug,
          editUrl: doc.editUrl,
          fields: doc.fields
            .filter((f) => markedFields.has(makeFieldKey(docKey, f.path)))
            .map((f) => {
              const entry: Record<string, string> = { path: f.path }
              for (const code of localeCodes) entry[code] = f.values[code] ?? ''
              return entry
            }),
        }
      }),
    }
    downloadJson(data, `content-review-marked-${new Date().toISOString().slice(0, 10)}.json`)
  }

  const showLocaleSelectors = localeCodes.length > 2

  function ModeButton({ mode, label, count, color }: { mode: ShowMode; label: string; count?: number; color?: string }) {
    const active = showMode === mode
    return (
      <button
        type="button"
        onClick={() => setShowMode(active ? 'all' : mode)}
        disabled={!active && (count === 0 || count === undefined)}
        style={{
          ...selectStyle,
          opacity: !active && (count === 0 || count === undefined) ? 0.4 : 1,
          border: `1px solid ${active && color ? `${color}88` : 'var(--theme-elevation-200, #333)'}`,
          color: active && color ? color : 'var(--theme-text, #eee)',
          background: active && color ? `${color}14` : 'var(--theme-elevation-100, #222)',
        }}
      >
        {label}{count !== undefined ? ` (${count})` : ''}
      </button>
    )
  }

  return (
    <>
      <style>{STYLES}</style>

      <div
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '20px',
          padding: '12px 16px',
          background: 'var(--theme-elevation-0, #1a1a1a)',
          border: '1px solid var(--theme-elevation-150, #2a2a2a)',
          borderRadius: '4px',
        }}
      >
        {showLocaleSelectors && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
              <span style={{ color: 'var(--theme-elevation-500)' }}>Left:</span>
              <select value={localeA} onChange={(e) => setLocaleA(e.target.value)} style={selectStyle}>
                {localeCodes.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
              <span style={{ color: 'var(--theme-elevation-500)' }}>Right:</span>
              <select value={localeB} onChange={(e) => setLocaleB(e.target.value)} style={selectStyle}>
                {localeCodes.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
            </label>
            <span style={{ display: 'inline-block', width: '1px', height: '20px', background: 'var(--theme-elevation-200)' }} />
          </>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
          <span style={{ color: 'var(--theme-elevation-500)' }}>Show:</span>
          <select value={filterKey} onChange={(e) => setFilterKey(e.target.value)} style={selectStyle}>
            <option value="new">New ({newCount})</option>
            <option value="drafts">Drafts ({draftCount})</option>
            <option value="all">All ({documents.length})</option>
            {groupOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </label>

        <span style={{ display: 'inline-block', width: '1px', height: '20px', background: 'var(--theme-elevation-200)' }} />

        <ModeButton mode="missing" label="Show Missing" count={totalMissing} color="#ef4444" />
        <ModeButton mode="warnings" label="Show Warnings" count={totalWarnings} color="#ca8a04" />
        <ModeButton mode="marked" label="Show Marked" count={markedCount} color="#f59e0b" />

        <span style={{ display: 'inline-block', width: '1px', height: '20px', background: 'var(--theme-elevation-200)' }} />

        <button type="button" onClick={handleExportAll} style={selectStyle}>
          Export JSON
        </button>
        <button
          type="button"
          onClick={handleExportMarked}
          disabled={markedCount === 0}
          style={{
            ...selectStyle,
            opacity: markedCount === 0 ? 0.4 : 1,
            border: `1px solid ${markedCount > 0 ? 'rgba(245,158,11,0.5)' : 'var(--theme-elevation-200, #333)'}`,
            color: markedCount > 0 ? '#f59e0b' : 'var(--theme-text, #eee)',
          }}
        >
          Export Marked ({markedCount})
        </button>

        <span style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--theme-elevation-400)' }}>
          {visibleDocs.length}{filterKey === 'new' && visibleDocs.length !== displayDocs.length ? `/${displayDocs.length}` : ''} doc{visibleDocs.length !== 1 ? 's' : ''}
          {!showLocaleSelectors && localeA !== localeB && ` · ${localeA.toUpperCase()} vs ${localeB.toUpperCase()}`}
        </span>
      </div>

      {visibleDocs.length === 0 ? (
        <p style={{ color: 'var(--theme-elevation-400)', fontSize: '14px' }}>
          {showMode === 'missing'
            ? 'No missing fields found, everything looks complete.'
            : showMode === 'warnings'
            ? 'No warnings, all localized fields have distinct content.'
            : showMode === 'marked'
            ? 'No marked fields yet. Click rows to mark them.'
            : filterKey === 'new'
            ? 'All documents reviewed, nothing new since last review.'
            : filterKey === 'drafts'
            ? 'No drafts pending. Everything is published.'
            : 'No documents.'}
        </p>
      ) : (
        visibleDocs.map((doc, i) => (
          <DocumentCard
            key={i}
            doc={doc}
            localeA={localeA}
            localeB={localeB}
            markedFields={markedFields}
            onToggleMark={handleToggleMark}
            showMode={showMode}
            reviewStatus={getReviewStatus(doc, notes)}
            onToggleReviewed={handleToggleReviewed}
            isPending={pendingKeys.has(doc.docKey)}
            isEditing={editingDocKey === doc.docKey}
            currentEdits={currentEdits}
            onEditChange={handleEditChange}
            onSave={() => handleSave(doc)}
            onCancelEdit={handleCancelEdit}
            onStartEdit={() => handleStartEdit(doc.docKey)}
            isSaving={isSaving}
            diffState={diffStates[doc.docKey] ?? { status: 'closed' }}
            onToggleDiff={() => handleToggleDiff(doc)}
          />
        ))
      )}
    </>
  )
}
