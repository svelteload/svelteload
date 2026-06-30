export const sanitizeUploadFilename = (filename: string): string => {
    const lastDot = filename.lastIndexOf('.')
    const hasExt = lastDot > 0
    const base = hasExt ? filename.slice(0, lastDot) : filename
    const ext = hasExt ? filename.slice(lastDot).toLowerCase() : ''

    const cleanBase = base
        .replace(/,/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')

    return `${cleanBase || 'file'}${ext}`
}
