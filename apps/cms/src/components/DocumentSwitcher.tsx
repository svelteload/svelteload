'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useConfig, useLocale, useTranslation } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'

const STORAGE_KEY = 'svl-doc-switcher-enabled'
const FETCH_LIMIT = 200
const MOBILE_BREAKPOINT = 1024

type DocSummary = {
  id: string | number
  title: string
  href: string
}

type Props = {
  excludedSlugs?: string[]
}

const cache = new Map<string, DocSummary[]>()
const inflight = new Map<string, Promise<DocSummary[]>>()

function buildHref(slug: string, id: string | number) {
  return `/admin/collections/${slug}/${id}`
}

function pickTitle(doc: any, field: string, locale: string | undefined, fallbackLocales: string[]) {
  const v = field ? doc?.[field] : undefined
  if (v == null || v === '') return null
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  if (typeof v === 'object') {
    if (locale && typeof v[locale] === 'string' && v[locale]) return v[locale]
    for (const l of fallbackLocales) {
      if (typeof v[l] === 'string' && v[l]) return v[l]
    }
    const first = Object.values(v).find((x) => typeof x === 'string' && x)
    if (typeof first === 'string') return first
  }
  return null
}

async function loadDocs(
  slug: string,
  titleField: string,
  locale: string | undefined,
  fallbackLocales: string[],
): Promise<DocSummary[]> {
  const cached = cache.get(slug)
  if (cached) return cached
  const existing = inflight.get(slug)
  if (existing) return existing

  const params = new URLSearchParams({
    limit: String(FETCH_LIMIT),
    depth: '0',
    sort: '-updatedAt',
    draft: 'true',
  })
  if (locale) params.set('locale', locale)

  const url = `/api/${encodeURIComponent(slug)}?${params.toString()}`
  const promise = fetch(url, { credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Failed to load ${slug}: ${res.status}`)
      const data = await res.json()
      const docs: DocSummary[] = (data?.docs ?? []).map((d: any) => {
        const title =
          pickTitle(d, titleField, locale, fallbackLocales) ??
          pickTitle(d, 'title', locale, fallbackLocales) ??
          pickTitle(d, 'name', locale, fallbackLocales) ??
          pickTitle(d, 'filename', locale, fallbackLocales) ??
          pickTitle(d, 'email', locale, fallbackLocales) ??
          String(d?.id ?? '')
        return { id: d.id, title, href: buildHref(slug, d.id) }
      })
      cache.set(slug, docs)
      inflight.delete(slug)
      return docs
    })
    .catch((err) => {
      inflight.delete(slug)
      throw err
    })
  inflight.set(slug, promise)
  return promise
}

export default function DocumentSwitcher({ excludedSlugs = [] }: Props) {
  const { config } = useConfig()
  const { i18n } = useTranslation() as { i18n: { language?: string } }
  const localeCtx = useLocale() as unknown as { code?: string } | undefined
  const pathname = usePathname() ?? ''

  const [enabled, setEnabled] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [isWide, setIsWide] = useState(true)
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null)
  const [isInteracting, setIsInteracting] = useState(false)
  const [docs, setDocs] = useState<DocSummary[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [navRight, setNavRight] = useState(275)
  const [headerEl, setHeaderEl] = useState<HTMLElement | null>(null)

  const excluded = useMemo(() => new Set(excludedSlugs), [excludedSlugs])

  useEffect(() => {
    setMounted(true)
    try {
      const v = localStorage.getItem(STORAGE_KEY)
      if (v === '1') setEnabled(true)
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setIsWide(window.innerWidth >= MOBILE_BREAKPOINT)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    let cancelled = false
    const find = () => {
      const el = document.querySelector('.nav__header-content') as HTMLElement | null
      if (el) {
        setHeaderEl(el)
        return true
      }
      return false
    }
    if (find()) return
    const observer = new MutationObserver(() => {
      if (cancelled) return
      if (find()) observer.disconnect()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [])

  const active = enabled && isWide && mounted

  useEffect(() => {
    setIsInteracting(false)
    setHoveredSlug(null)
  }, [pathname])

  const activeSlug = useMemo(() => {
    const m = pathname.match(/^\/admin\/collections\/([^\/]+)/)
    return m ? m[1] : null
  }, [pathname])

  const collections = config.collections ?? []
  const collectionsBySlug = useMemo(() => {
    const map = new Map<string, any>()
    for (const c of collections) map.set(c.slug, c)
    return map
  }, [collections])

  const displaySlug = useMemo(() => {
    if (hoveredSlug) return excluded.has(hoveredSlug) ? null : hoveredSlug
    if (activeSlug && !excluded.has(activeSlug)) return activeSlug
    return null
  }, [hoveredSlug, activeSlug, excluded])

  const panelVisible = active && isInteracting && displaySlug !== null

  const targetCollection = displaySlug ? collectionsBySlug.get(displaySlug) : null
  const titleField: string = targetCollection?.admin?.useAsTitle ?? 'id'

  const localeCode: string | undefined = localeCtx?.code ?? i18n?.language
  const fallbackLocales = useMemo(() => {
    const locs = (config.localization as any)?.localeCodes ?? []
    return Array.isArray(locs) ? locs : []
  }, [config])

  useEffect(() => {
    if (!panelVisible || !displaySlug) {
      return
    }
    const cached = cache.get(displaySlug)
    if (cached) {
      setDocs(cached)
      setLoading(false)
      return
    }
    setDocs(null)
    setLoading(true)
    let cancelled = false
    loadDocs(displaySlug, titleField, localeCode, fallbackLocales)
      .then((d) => {
        if (!cancelled) {
          setDocs(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [panelVisible, displaySlug, titleField, localeCode, fallbackLocales])

  useEffect(() => {
    if (!active) return
    const onOver = (e: Event) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      const inPanel = target.closest('.svl-doc-switcher-panel')
      const inNav = target.closest('.nav__scroll, .nav')
      if (!inNav && !inPanel) {
        setIsInteracting(false)
        setHoveredSlug(null)
        return
      }
      setIsInteracting(true)
      if (inPanel) return
      const link = target.closest('a.nav__link, div.nav__link') as HTMLElement | null
      if (!link) {
        return
      }
      const id = link.id
      if (!id || !id.startsWith('nav-') || id.startsWith('nav-global-')) {
        setHoveredSlug(null)
        return
      }
      setHoveredSlug(id.slice(4))
    }
    document.addEventListener('pointerover', onOver, true)
    return () => document.removeEventListener('pointerover', onOver, true)
  }, [active])

  useEffect(() => {
    if (!active) return
    const navEl = document.querySelector('.nav') as HTMLElement | null
    if (!navEl) return
    const measure = () => {
      const rect = navEl.getBoundingClientRect()
      setNavRight(Math.max(0, rect.right))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(navEl)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [active])

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {}
      return next
    })
  }, [])

  const collectionLabel = useMemo(() => {
    if (!targetCollection) return ''
    const labels = targetCollection.labels?.plural
    if (typeof labels === 'string') return labels
    if (labels && typeof labels === 'object') {
      if (localeCode && typeof labels[localeCode] === 'string') return labels[localeCode]
      if (i18n?.language && typeof labels[i18n.language] === 'string') return labels[i18n.language]
      const first = Object.values(labels).find((v) => typeof v === 'string')
      if (typeof first === 'string') return first
    }
    return targetCollection.slug
  }, [targetCollection, localeCode, i18n])

  const toggleButton = (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={enabled ? 'Disable quick switcher' : 'Enable quick switcher'}
      title={enabled ? 'Disable quick switcher' : 'Enable quick switcher'}
      className={`svl-doc-switcher-toggle${enabled ? ' is-on' : ''}`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
        <line x1="6.5" y1="2.5" x2="6.5" y2="13.5" />
      </svg>
    </button>
  )

  return (
    <>
      <style>{`
        .svl-doc-switcher-toggle {
          position: absolute;
          top: 11px;
          left: calc(var(--nav-width) - 65px);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          padding: 0;
          background: transparent;
          border: 1px solid var(--theme-elevation-150, #2a2a2a);
          border-radius: 4px;
          color: var(--theme-elevation-600, #999);
          cursor: pointer;
          transition: background 0.1s ease, color 0.1s ease, border-color 0.1s ease;
          z-index: 2;
        }
        .svl-doc-switcher-toggle:hover {
          background: var(--theme-elevation-100, #1f1f1f);
          color: var(--theme-text, #fff);
          border-color: var(--theme-elevation-200, #333);
        }
        .svl-doc-switcher-toggle.is-on {
          background: var(--theme-elevation-100, #1f1f1f);
          color: var(--theme-text, #fff);
          border-color: var(--theme-elevation-200, #333);
        }
      `}</style>

      {mounted && headerEl ? createPortal(toggleButton, headerEl) : null}

      {active && (
        <style>{`
          .svl-doc-switcher-row {
            display: block;
            padding: 7px 16px;
            color: var(--theme-elevation-700, #ccc);
            background: transparent;
            text-decoration: none;
            font-size: 13px;
            line-height: 1.4;
            border-left: 2px solid transparent;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            transition: background 0.1s ease, color 0.1s ease;
          }
          .svl-doc-switcher-row:hover {
            background: var(--theme-elevation-100, #1f1f1f);
            color: var(--theme-text, #fff);
          }
          .svl-doc-switcher-row.is-active {
            color: var(--theme-text, #fff);
            background: var(--theme-elevation-100, #1f1f1f);
            border-left-color: var(--theme-text, #fff);
          }
          .svl-doc-switcher-view-all {
            display: block;
            padding: 10px 16px;
            margin-top: 8px;
            font-size: 12px;
            color: var(--theme-elevation-500, #888);
            text-decoration: none;
            border-top: 1px solid var(--theme-elevation-100, #1a1a1a);
            transition: color 0.1s ease;
          }
          .svl-doc-switcher-view-all:hover {
            color: var(--theme-text, #fff);
          }
        `}</style>
      )}

      {panelVisible &&
        createPortal(
          <aside
            className="svl-doc-switcher-panel"
            style={{
              position: 'fixed',
              top: 0,
              left: `${navRight}px`,
              bottom: 0,
              width: 260,
              background: 'var(--theme-elevation-0, #111)',
              borderRight: '1px solid var(--theme-elevation-100, #1a1a1a)',
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '20px 0 20px',
              zIndex: 40,
              boxSizing: 'border-box',
              boxShadow: '4px 0 12px rgba(0,0,0,0.2)',
            }}
          >
            <div
              style={{
                padding: '0 16px 12px',
                fontSize: 11,
                color: 'var(--theme-elevation-500, #888)',
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                fontWeight: 600,
              }}
            >
              {collectionLabel}
            </div>

            {loading && !docs && (
              <div
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  color: 'var(--theme-elevation-500, #888)',
                }}
              >
                Loading…
              </div>
            )}

            {docs && docs.length === 0 && (
              <div
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  color: 'var(--theme-elevation-500, #888)',
                }}
              >
                No documents
              </div>
            )}

            {docs &&
              docs.map((doc) => {
                const isCurrent = pathname === doc.href || pathname.startsWith(`${doc.href}/`)
                return (
                  <Link
                    key={String(doc.id)}
                    href={doc.href}
                    prefetch={false}
                    className={`svl-doc-switcher-row${isCurrent ? ' is-active' : ''}`}
                  >
                    {doc.title}
                  </Link>
                )
              })}

            {docs && docs.length >= FETCH_LIMIT && (
              <Link
                href={`/admin/collections/${displaySlug}`}
                prefetch={false}
                className="svl-doc-switcher-view-all"
              >
                View all →
              </Link>
            )}
          </aside>,
          document.body,
        )}
    </>
  )
}
