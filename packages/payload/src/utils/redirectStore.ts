import type { Payload } from 'payload'

type PendingEntry = {
    id?: string
    collectionSlug?: string | null
    docId?: string | null
    locale?: string | null
    from?: string | null
    to?: string | null
}

type RedirectEntry = {
    id?: string
    from?: string | null
    to?: string | null
}

type Target = {
    payload: Payload
    collectionSlug: string
    docId: string | number
}

let queue: Promise<unknown> = Promise.resolve()

const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task)
    queue = run.then(
        () => undefined,
        () => undefined,
    )
    return run
}

const readPending = async (payload: Payload): Promise<PendingEntry[]> => {
    const global = (await payload.findGlobal({
        slug: 'pending-redirects' as never,
        depth: 0,
        overrideAccess: true,
    })) as { pending?: PendingEntry[] | null } | null
    return global?.pending ?? []
}

const writePending = async (payload: Payload, pending: PendingEntry[]): Promise<void> => {
    await payload.updateGlobal({
        slug: 'pending-redirects' as never,
        data: { pending } as never,
        depth: 0,
        overrideAccess: true,
        context: { bypassHooks: true },
    })
}

const matches = (entry: PendingEntry, collectionSlug: string, docId: string | number): boolean =>
    entry.collectionSlug === collectionSlug && String(entry.docId) === String(docId)

const hasPublishedVersion = async ({ payload, collectionSlug, docId }: Target): Promise<boolean> => {
    try {
        const result = await payload.findVersions({
            collection: collectionSlug as never,
            where: {
                and: [{ parent: { equals: docId } }, { 'version._status': { equals: 'published' } }],
            },
            limit: 1,
            depth: 0,
            overrideAccess: true,
        })
        return result.totalDocs > 0
    } catch (_) {
        return false
    }
}

export const stagePendingRedirect = async ({
    payload,
    collectionSlug,
    docId,
    locale,
    from,
    to,
}: Target & { locale: string; from: string; to: string }): Promise<void> => {
    if (!from || !to || from === to) return

    await serialize(async () => {
        const pending = await readPending(payload)
        const index = pending.findIndex((entry) => matches(entry, collectionSlug, docId) && entry.locale === locale)

        if (index >= 0) {
            if (pending[index].from === to) {
                pending.splice(index, 1)
            } else {
                pending[index] = { ...pending[index], to }
            }
        } else {
            if (!(await hasPublishedVersion({ payload, collectionSlug, docId }))) return
            pending.push({ collectionSlug, docId: String(docId), locale, from, to })
        }

        await writePending(payload, pending)
    })
}

export const promotePendingRedirects = async ({ payload, collectionSlug, docId }: Target): Promise<number> =>
    serialize(async () => {
        const pending = await readPending(payload)
        const mine = pending.filter((entry) => matches(entry, collectionSlug, docId))
        if (!mine.length) return 0

        const global = (await payload.findGlobal({
            slug: 'url-redirects' as never,
            depth: 0,
            overrideAccess: true,
        })) as { redirects?: RedirectEntry[] | null } | null

        let redirects: RedirectEntry[] = [...(global?.redirects ?? [])]

        for (const entry of mine) {
            const from = entry.from
            const to = entry.to
            if (!from || !to || from === to) continue

            for (const existing of redirects) {
                if (existing.to === from) existing.to = to
            }

            const index = redirects.findIndex((existing) => existing.from === from)
            if (index >= 0) {
                redirects[index] = { ...redirects[index], to }
            } else {
                redirects.push({ from, to })
            }

            redirects = redirects.filter((existing) => existing.from !== to)
        }

        redirects = redirects.filter((existing) => existing.from && existing.to && existing.from !== existing.to)

        await payload.updateGlobal({
            slug: 'url-redirects' as never,
            data: { redirects } as never,
            depth: 0,
            overrideAccess: true,
            context: { bypassHooks: true },
        })

        await writePending(
            payload,
            pending.filter((entry) => !matches(entry, collectionSlug, docId)),
        )

        return mine.length
    })

export const dropPendingRedirects = async ({ payload, collectionSlug, docId }: Target): Promise<void> => {
    await serialize(async () => {
        const pending = await readPending(payload)
        const remaining = pending.filter((entry) => !matches(entry, collectionSlug, docId))
        if (remaining.length === pending.length) return
        await writePending(payload, remaining)
    })
}
