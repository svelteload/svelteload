'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useConfig } from '@payloadcms/ui'

type HideTarget = { kind: 'collections' | 'globals'; slug: string; requires: string }

const STORAGE_KEY = 'svelteload:present-page-types'

const collectHideTargets = (config: any): HideTarget[] => {
    const targets: HideTarget[] = []
    for (const c of config?.collections ?? []) {
        const r = c?.admin?.custom?.requiresPageType
        if (typeof r === 'string' && r) targets.push({ kind: 'collections', slug: c.slug, requires: r })
    }
    for (const g of config?.globals ?? []) {
        const r = g?.admin?.custom?.requiresPageType
        if (typeof r === 'string' && r) targets.push({ kind: 'globals', slug: g.slug, requires: r })
    }
    return targets
}

const readCached = (): Set<string> | null => {
    if (typeof window === 'undefined') return null
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return null
        return new Set(parsed.filter((v): v is string => typeof v === 'string'))
    } catch {
        return null
    }
}

const writeCached = (types: Set<string>): void => {
    if (typeof window === 'undefined') return
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...types]))
    } catch {}
}

export default function RequiresPageTypeNavFilter() {
    const { config } = useConfig() as any
    const targets = useMemo(() => collectHideTargets(config), [config])
    const [presentTypes, setPresentTypes] = useState<Set<string> | null>(() => readCached())

    useEffect(() => {
        if (targets.length === 0) return
        if (presentTypes !== null) return
        let cancelled = false
        fetch('/api/pages?where[pageType][exists]=true&depth=0&limit=100', { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : { docs: [] }))
            .then((data: any) => {
                if (cancelled) return
                const types = new Set<string>()
                for (const d of data?.docs ?? []) {
                    if (typeof d?.pageType === 'string' && d.pageType) types.add(d.pageType)
                }
                writeCached(types)
                setPresentTypes(types)
            })
            .catch(() => {
                if (!cancelled) setPresentTypes(new Set())
            })
        return () => { cancelled = true }
    }, [targets, presentTypes])

    const hiddenPaths = useMemo(() => {
        if (targets.length === 0) return []
        if (presentTypes === null) return targets.map((t) => `/admin/${t.kind}/${t.slug}`)
        return targets
            .filter((t) => !presentTypes.has(t.requires))
            .map((t) => `/admin/${t.kind}/${t.slug}`)
    }, [targets, presentTypes])

    if (hiddenPaths.length === 0) return null

    const css = hiddenPaths
        .flatMap((p) => [
            `nav a[href="${p}"]`,
            `nav a[href="${p}/"]`,
            `nav a[href^="${p}?"]`,
        ])
        .map((sel) => `${sel} { display: none !important; }`)
        .join('\n')

    return <style dangerouslySetInnerHTML={{ __html: css }} />
}
