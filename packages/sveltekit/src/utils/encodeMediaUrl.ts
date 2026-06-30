export function encodeMediaUrl(url: string | undefined | null): string {
    if (!url) return ''
    return encodeURI(url).replace(/,/g, '%2C')
}
