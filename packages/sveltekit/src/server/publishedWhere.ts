export type PublishedWhere = {
    and: Array<Record<string, unknown>>
}

// Payload's `draft: false` still returns docs whose latest saved state is a draft, so the
// `_status` clause is what actually keeps unpublished content off the live site.
export function publishedWhere(isDraft: boolean, dateField: string): PublishedWhere {
    return {
        and: [
            { [dateField]: { less_than_equal: new Date().toISOString() } },
            ...(isDraft ? [] : [{ _status: { equals: 'published' } }]),
        ],
    }
}

export function excludingDoc(where: PublishedWhere, id: string | number): any {
    return { and: [...where.and, { id: { not_equals: id } }] }
}
