export function sectionSlugFromHtml(html: string | undefined | null, fallback: string = ''): string {
    if (!html) return fallback
    const match = html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)
    const text = match?.[1]?.replace(/<[^>]+>/g, '').trim()
    if (!text) return fallback
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
}
