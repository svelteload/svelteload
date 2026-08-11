export function pinSort<T extends Record<string, any>>(
    items: T[],
    dateField: string = 'publishDate',
): T[] {
    return [...items].sort((a, b) => {
        const aPin = a.pinnedOrder ?? null
        const bPin = b.pinnedOrder ?? null
        if (aPin !== null && bPin !== null) return aPin - bPin
        if (aPin !== null) return -1
        if (bPin !== null) return 1
        const aDate = a[dateField] ? new Date(a[dateField]).getTime() : 0
        const bDate = b[dateField] ? new Date(b[dateField]).getTime() : 0
        return bDate - aDate
    })
}
