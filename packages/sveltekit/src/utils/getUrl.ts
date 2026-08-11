export function getLocalizedUrl(url: string | undefined, locale: string): string {
    if (!url) return '#'

    if (url.startsWith('#')) {
        return url
    }

    if (url.startsWith('https://') || url.startsWith('http://')) {
        return url
    }

    if (url === '/') {
        return `/${locale}`
    } else {
        return `/${locale}${url}`
    }
}

export function handleHashClick(event: MouseEvent, url: string | undefined): void {
    if (!url) return
    const hashIndex = url.indexOf('#')
    if (hashIndex === -1) return
    const path = url.slice(0, hashIndex)
    if (path && path !== '/') return
    event.preventDefault()
    const fragment = url.slice(hashIndex + 1)
    if (!fragment) return
    document.getElementById(fragment)?.scrollIntoView({ behavior: 'smooth' })
}
