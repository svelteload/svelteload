export type PublishTarget = {
    collection: string
    id: string | number
    status: string
    title?: string
    paths?: Record<string, string>
}

export async function publishDocument(target: PublishTarget, locale: string): Promise<string | null> {
    try {
        const response = await fetch('/api/preview/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ collection: target.collection, id: target.id, locale }),
        })
        const result = await response.json().catch(() => null)
        if (!response.ok) return result?.error ?? 'Publishing failed.'
        return null
    } catch (err) {
        return err instanceof Error ? err.message : String(err)
    }
}
