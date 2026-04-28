'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type Role = 'admin' | 'editor' | 'contributor'

interface Props {
  onClose: () => void
}

type ParsedRow = {
  name: string
  email: string
  role: string
}

type RowStatus =
  | { kind: 'valid' }
  | { kind: 'invalid'; error: string }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'failed'; error: string }

const ROLE_VALUES: Role[] = ['admin', 'editor', 'contributor']

export function InviteUserDialog({ onClose }: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<'single' | 'bulk'>('single')

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('editor')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [bulkInput, setBulkInput] = useState('')
  const [bulkStatus, setBulkStatus] = useState<RowStatus[]>([])
  const [bulkSending, setBulkSending] = useState(false)

  const bulkRows = useMemo(() => parseInput(bulkInput), [bulkInput])

  useEffect(() => {
    setBulkStatus(bulkRows.map(validateRow))
  }, [bulkRows])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !bulkSending) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, bulkSending])

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: name || undefined, role }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to send invitation')
      } else {
        router.refresh()
        onClose()
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const handleBulkSubmit = async () => {
    setBulkSending(true)
    const status: RowStatus[] = bulkStatus.map((s) =>
      s.kind === 'invalid' ? s : { kind: 'valid' as const },
    )
    setBulkStatus([...status])

    let anySucceeded = false
    let anyFailed = false

    for (let i = 0; i < bulkRows.length; i++) {
      if (status[i].kind === 'invalid') continue

      status[i] = { kind: 'sending' }
      setBulkStatus([...status])

      const row = bulkRows[i]
      const sendRole = (normalizeRole(row.role) ?? 'editor') as Role
      try {
        const res = await fetch('/api/invite-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: row.email.trim().toLowerCase(),
            name: row.name.trim() || undefined,
            role: sendRole,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          status[i] = { kind: 'failed', error: data.error ?? 'Failed' }
          anyFailed = true
        } else {
          status[i] = { kind: 'sent' }
          anySucceeded = true
        }
      } catch {
        status[i] = { kind: 'failed', error: 'Network error' }
        anyFailed = true
      }
      setBulkStatus([...status])
    }

    if (anySucceeded) router.refresh()
    setBulkSending(false)

    if (anySucceeded && !anyFailed) onClose()
  }

  const validCount = bulkStatus.filter((s) => s.kind !== 'invalid').length

  return (
    <div onClick={() => !bulkSending && onClose()} style={overlayStyle}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...dialogStyle, maxWidth: mode === 'bulk' ? '760px' : '440px' }}
      >
        <h2 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 700 }}>Invite user</h2>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--theme-elevation-500)' }}>
          {mode === 'bulk'
            ? 'Paste CSV or a markdown table with name, email, and role columns.'
            : "They'll receive an email with a link to set their password and sign in."}
        </p>

        <div style={tabsRowStyle}>
          <ModeTab active={mode === 'single'} onClick={() => setMode('single')}>
            Single
          </ModeTab>
          <ModeTab active={mode === 'bulk'} onClick={() => setMode('bulk')}>
            Bulk
          </ModeTab>
        </div>

        {mode === 'single' ? (
          <form onSubmit={handleSingleSubmit}>
            <label style={{ display: 'block', marginBottom: '14px' }}>
              <span style={labelStyle}>Email</span>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="person@example.com"
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'block', marginBottom: '14px' }}>
              <span style={labelStyle}>Name (optional)</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'block', marginBottom: '20px' }}>
              <span style={labelStyle}>Role</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                style={inputStyle}
              >
                <option value="editor">Editor — content, can publish</option>
                <option value="contributor">Contributor — content, drafts only</option>
                <option value="admin">Admin — full access</option>
              </select>
            </label>

            {error && <ErrorBanner message={error} />}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="btn btn--style-secondary btn--size-small"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !email}
                className="btn btn--style-primary btn--size-small"
              >
                {loading ? 'Sending…' : 'Send invitation'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <label style={{ display: 'block', marginBottom: '14px' }}>
              <span style={labelStyle}>Paste rows</span>
              <textarea
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                disabled={bulkSending}
                placeholder={`name,email,role\nSamuel Hasselblom,samuel@nodebrush.com,Admin\n\nor\n\n| name | email | role |\n| --- | --- | --- |\n| Samuel Hasselblom | samuel@nodebrush.com | Admin |`}
                rows={6}
                style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }}
              />
            </label>

            {bulkRows.length > 0 && (
              <div style={previewWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Email</th>
                      <th style={thStyle}>Role</th>
                      <th style={{ ...thStyle, width: '160px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.map((row, i) => {
                      const status = bulkStatus[i] ?? { kind: 'valid' as const }
                      const resolvedRole = normalizeRole(row.role)
                      return (
                        <tr key={i}>
                          <td style={tdStyle}>{row.name || <Muted>—</Muted>}</td>
                          <td style={tdStyle}>{row.email || <Muted>—</Muted>}</td>
                          <td style={tdStyle}>
                            {resolvedRole ?? (row.role ? row.role : <Muted>editor</Muted>)}
                          </td>
                          <td style={tdStyle}>
                            <StatusCell status={status} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={bulkSending}
                className="btn btn--style-secondary btn--size-small"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkSubmit}
                disabled={bulkSending || validCount === 0}
                className="btn btn--style-primary btn--size-small"
              >
                {bulkSending
                  ? 'Sending…'
                  : `Invite ${validCount}${validCount === 1 ? ' user' : ' users'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        padding: '8px 14px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        color: active ? 'var(--theme-text, #eee)' : 'var(--theme-elevation-500)',
        borderBottom: active ? '2px solid var(--theme-text, #eee)' : '2px solid transparent',
        marginBottom: '-1px',
      }}
    >
      {children}
    </button>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        background: 'rgba(239,68,68,0.08)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: '4px',
        fontSize: '13px',
        color: '#ef4444',
        marginBottom: '16px',
      }}
    >
      {message}
    </div>
  )
}

function StatusCell({ status }: { status: RowStatus }) {
  switch (status.kind) {
    case 'valid':
      return <span style={{ color: 'var(--theme-elevation-500)' }}>Ready</span>
    case 'invalid':
      return <span style={{ color: '#ef4444' }}>{status.error}</span>
    case 'sending':
      return <span style={{ color: 'var(--theme-elevation-500)' }}>Sending…</span>
    case 'sent':
      return <span style={{ color: '#4ade80' }}>Invited</span>
    case 'failed':
      return <span style={{ color: '#ef4444' }}>{status.error}</span>
  }
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--theme-elevation-400)' }}>{children}</span>
}

function parseInput(input: string): ParsedRow[] {
  const text = input.trim()
  if (!text) return []

  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (rawLines.length === 0) return []

  const isMarkdown = rawLines[0].startsWith('|')

  const cellRows: string[][] = []
  for (const line of rawLines) {
    if (isMarkdown) {
      if (/^\|?\s*[-:]+\s*(\|\s*[-:]+\s*)+\|?\s*$/.test(line)) continue
      const stripped = line.replace(/^\|/, '').replace(/\|$/, '')
      cellRows.push(stripped.split('|').map((c) => c.trim()))
    } else {
      cellRows.push(parseCsvLine(line))
    }
  }

  if (cellRows.length === 0) return []

  const first = cellRows[0].map((c) => c.toLowerCase().trim())
  const hasHeader = first.some((c) => c === 'email' || c === 'name' || c === 'role')

  let emailIdx = -1
  let nameIdx = -1
  let roleIdx = -1

  if (hasHeader) {
    first.forEach((c, i) => {
      if (c === 'email' && emailIdx === -1) emailIdx = i
      else if (c === 'name' && nameIdx === -1) nameIdx = i
      else if (c === 'role' && roleIdx === -1) roleIdx = i
    })
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    cellRows[0].forEach((cell, i) => {
      if (emailIdx === -1 && emailRegex.test(cell.trim())) emailIdx = i
    })
    const others = cellRows[0].map((_, i) => i).filter((i) => i !== emailIdx)
    others.forEach((i) => {
      const cell = cellRows[0][i].toLowerCase().trim()
      if (ROLE_VALUES.includes(cell as Role)) {
        if (roleIdx === -1) roleIdx = i
      } else if (nameIdx === -1) {
        nameIdx = i
      }
    })
  }

  const dataRows = hasHeader ? cellRows.slice(1) : cellRows

  return dataRows.map((r) => ({
    name: nameIdx >= 0 && nameIdx < r.length ? r[nameIdx] : '',
    email: emailIdx >= 0 && emailIdx < r.length ? r[emailIdx] : '',
    role: roleIdx >= 0 && roleIdx < r.length ? r[roleIdx] : '',
  }))
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else if (ch === ',') {
      result.push(current.trim())
      current = ''
    } else if (ch === '"' && current === '') {
      inQuotes = true
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function normalizeRole(input: string): Role | null {
  const v = input.trim().toLowerCase()
  if (!v) return null
  return (ROLE_VALUES as string[]).includes(v) ? (v as Role) : null
}

function validateRow(row: ParsedRow): RowStatus {
  const email = row.email.trim().toLowerCase()
  if (!email) return { kind: 'invalid', error: 'Missing email' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { kind: 'invalid', error: 'Invalid email' }
  }
  if (row.role.trim() && normalizeRole(row.role) === null) {
    return { kind: 'invalid', error: `Unknown role "${row.role.trim()}"` }
  }
  return { kind: 'valid' }
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
}

const dialogStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--theme-bg, #1a1a1a)',
  border: '1px solid var(--theme-elevation-150, #2a2a2a)',
  borderRadius: '6px',
  padding: '24px',
  color: 'var(--theme-text, #eee)',
}

const tabsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '4px',
  marginBottom: '20px',
  borderBottom: '1px solid var(--theme-elevation-150, #2a2a2a)',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '12px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--theme-elevation-600)',
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '8px 10px',
  background: 'var(--theme-elevation-50, #111)',
  border: '1px solid var(--theme-elevation-200, #333)',
  borderRadius: '4px',
  color: 'var(--theme-text, #eee)',
  fontSize: '14px',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const previewWrapStyle: React.CSSProperties = {
  maxHeight: '320px',
  overflow: 'auto',
  border: '1px solid var(--theme-elevation-200, #333)',
  borderRadius: '4px',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '13px',
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  background: 'var(--theme-elevation-50, #111)',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--theme-elevation-600)',
  borderBottom: '1px solid var(--theme-elevation-200, #333)',
  position: 'sticky',
  top: 0,
}

const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid var(--theme-elevation-100, #222)',
  verticalAlign: 'top',
}
