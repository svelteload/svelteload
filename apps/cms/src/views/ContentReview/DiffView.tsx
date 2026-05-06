'use client'

import React, { useMemo } from 'react'
import type { DocumentDiff, FieldDiff, ItemDiff } from './diff'

type Segment = { type: 'eq' | 'del' | 'ins'; text: string }

function tokenize(s: string): string[] {
  return s.split(/(\s+)/).filter((t) => t.length > 0)
}

function lcsDiff(a: string[], b: string[]): Segment[] {
  const n = a.length
  const m = b.length
  if (n === 0) return b.length ? [{ type: 'ins', text: b.join('') }] : []
  if (m === 0) return [{ type: 'del', text: a.join('') }]

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1
      else dp[i][j] = dp[i - 1][j] >= dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1]
    }
  }

  const segments: Segment[] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      segments.unshift({ type: 'eq', text: a[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      segments.unshift({ type: 'ins', text: b[j - 1] })
      j--
    } else {
      segments.unshift({ type: 'del', text: a[i - 1] })
      i--
    }
  }
  return segments
}

function coalesce(segments: Segment[]): Segment[] {
  const out: Segment[] = []
  for (const seg of segments) {
    const last = out[out.length - 1]
    if (last && last.type === seg.type) last.text += seg.text
    else out.push({ ...seg })
  }
  return out
}

function computeWordDiff(oldStr: string, newStr: string): Segment[] {
  if (oldStr === newStr) return [{ type: 'eq', text: oldStr }]
  const a = tokenize(oldStr)
  const b = tokenize(newStr)

  let prefix = 0
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++

  let suffix = 0
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++
  }

  const aMid = a.slice(prefix, a.length - suffix)
  const bMid = b.slice(prefix, b.length - suffix)

  const segments: Segment[] = []
  if (prefix > 0) segments.push({ type: 'eq', text: a.slice(0, prefix).join('') })
  segments.push(...lcsDiff(aMid, bMid))
  if (suffix > 0) segments.push({ type: 'eq', text: a.slice(a.length - suffix).join('') })

  return coalesce(segments)
}

const s = {
  fieldRow: { marginBottom: '16px' } as React.CSSProperties,
  fieldLabel: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: 'var(--theme-text-field-label, var(--theme-elevation-800))',
    marginBottom: '6px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  } as React.CSSProperties,
  localeBadge: {
    fontSize: '10px',
    fontWeight: 700,
    padding: '1px 5px',
    borderRadius: '3px',
    background: 'var(--theme-elevation-200)',
    color: 'var(--theme-elevation-600)',
    letterSpacing: '0.04em',
    flexShrink: 0,
  } as React.CSSProperties,
  valueRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-start',
    marginBottom: '4px',
  } as React.CSSProperties,
  badge: (variant: 'old' | 'new') =>
    ({
      fontSize: '10px',
      fontWeight: 700,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.05em',
      padding: '2px 6px',
      borderRadius: '3px',
      flexShrink: 0,
      marginTop: '2px',
      background:
        variant === 'old'
          ? 'var(--theme-error-100, rgba(220,53,69,0.12))'
          : 'var(--theme-success-100, rgba(25,135,84,0.12))',
      color:
        variant === 'old'
          ? 'var(--theme-error-500, #dc3545)'
          : 'var(--theme-success-500, #198754)',
    }) as React.CSSProperties,
  valueText: {
    fontSize: '13px',
    lineHeight: 1.5,
    color: 'var(--theme-elevation-700, #ddd)',
    wordBreak: 'break-word' as const,
    whiteSpace: 'pre-wrap' as const,
  } as React.CSSProperties,
  segHighlight: (variant: 'old' | 'new') =>
    ({
      color:
        variant === 'old'
          ? 'var(--theme-error-500, #dc3545)'
          : 'var(--theme-success-500, #198754)',
    }) as React.CSSProperties,
  itemBlock: {
    borderLeft: '3px solid var(--theme-elevation-200, #333)',
    paddingLeft: '12px',
    marginBottom: '16px',
  } as React.CSSProperties,
  itemBlockAdded: {
    borderLeft: '3px solid var(--theme-success-500, #198754)',
    paddingLeft: '12px',
    marginBottom: '16px',
  } as React.CSSProperties,
  itemBlockRemoved: {
    borderLeft: '3px solid var(--theme-error-500, #dc3545)',
    paddingLeft: '12px',
    marginBottom: '16px',
    opacity: 0.65,
  } as React.CSSProperties,
  itemHeader: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--theme-elevation-800)',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  statusChip: (status: 'added' | 'removed' | 'changed') =>
    ({
      fontSize: '10px',
      fontWeight: 700,
      textTransform: 'uppercase' as const,
      padding: '1px 5px',
      borderRadius: '3px',
      background:
        status === 'added'
          ? 'var(--theme-success-100, rgba(25,135,84,0.12))'
          : status === 'removed'
            ? 'var(--theme-error-100, rgba(220,53,69,0.12))'
            : 'var(--theme-warning-100, rgba(255,193,7,0.12))',
      color:
        status === 'added'
          ? 'var(--theme-success-500, #198754)'
          : status === 'removed'
            ? 'var(--theme-error-500, #dc3545)'
            : 'var(--theme-warning-500, #cc9800)',
    }) as React.CSSProperties,
  blockTypeChip: {
    fontSize: '10px',
    color: 'var(--theme-elevation-500)',
    fontFamily: 'monospace',
  } as React.CSSProperties,
  emptyState: {
    fontSize: '13px',
    color: 'var(--theme-elevation-500)',
    fontStyle: 'italic',
    padding: '8px 0',
  } as React.CSSProperties,
}

function FieldDiffRow({ diff }: { diff: FieldDiff }) {
  const isEmpty = !diff.old && !diff.new
  const segments = useMemo(() => computeWordDiff(diff.old, diff.new), [diff.old, diff.new])
  if (isEmpty) return null

  const renderRow = (variant: 'old' | 'new') => {
    const filtered = segments.filter((seg) =>
      variant === 'old' ? seg.type !== 'ins' : seg.type !== 'del',
    )
    return filtered.map((seg, i) => {
      const isHighlight =
        (variant === 'old' && seg.type === 'del') ||
        (variant === 'new' && seg.type === 'ins')
      if (!isHighlight) return <span key={i}>{seg.text}</span>
      return (
        <span key={i} style={s.segHighlight(variant)}>
          {seg.text}
        </span>
      )
    })
  }

  return (
    <div style={s.fieldRow}>
      <div style={s.fieldLabel}>
        <span>{diff.path}</span>
        {diff.locale && <span style={s.localeBadge}>{diff.locale}</span>}
      </div>
      {diff.old && (
        <div style={s.valueRow}>
          <span style={s.badge('old')}>Was</span>
          <span style={s.valueText}>{renderRow('old')}</span>
        </div>
      )}
      {diff.new && (
        <div style={s.valueRow}>
          <span style={s.badge('new')}>Now</span>
          <span style={s.valueText}>{renderRow('new')}</span>
        </div>
      )}
    </div>
  )
}

function ItemDiffBlock({ item }: { item: ItemDiff }) {
  const blockStyle =
    item.status === 'added'
      ? s.itemBlockAdded
      : item.status === 'removed'
        ? s.itemBlockRemoved
        : s.itemBlock
  return (
    <div style={blockStyle}>
      <div style={s.itemHeader}>
        <span style={s.statusChip(item.status)}>{item.status}</span>
        <span>{item.label}</span>
        {item.blockType && <span style={s.blockTypeChip}>{item.blockType}</span>}
      </div>
      {item.fieldDiffs.map((fd, i) => (
        <FieldDiffRow key={i} diff={fd} />
      ))}
    </div>
  )
}

export function DiffPanel({ diff }: { diff: DocumentDiff }) {
  const hasFieldDiffs = diff.fieldDiffs.length > 0
  const hasItemDiffs = diff.itemDiffs.length > 0

  if (!hasFieldDiffs && !hasItemDiffs) {
    return (
      <div style={{ padding: '12px 16px' }}>
        <p style={s.emptyState}>No text changes detected. Check Payload compare view for details.</p>
      </div>
    )
  }

  return (
    <div
      style={{
        padding: '16px',
        background: 'var(--theme-elevation-50, rgba(0,0,0,0.2))',
        borderBottom: '1px solid var(--theme-elevation-150, #2a2a2a)',
      }}
    >
      {diff.isNew && (
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            padding: '2px 6px',
            borderRadius: '3px',
            background: 'var(--theme-warning-100, rgba(255,193,7,0.15))',
            color: 'var(--theme-warning-500, #cc9800)',
            display: 'inline-block',
            marginBottom: '12px',
          }}
        >
          Never published
        </div>
      )}
      {hasFieldDiffs && (
        <div style={{ marginBottom: hasItemDiffs ? '20px' : 0 }}>
          {diff.fieldDiffs.map((fd, i) => (
            <FieldDiffRow key={i} diff={fd} />
          ))}
        </div>
      )}
      {hasItemDiffs && (
        <div>
          {diff.itemDiffs.map((item, i) => (
            <ItemDiffBlock key={i} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
