import { error, fail, json, type Actions, type RequestHandler, type ServerLoad } from '@sveltejs/kit'
import { getPayloadInstance } from './payload'
import { AUTH_COOKIE_NAME, verifySessionToken, type SessionUser } from './sessionUser'
import { appendRedirect, dropPendingRedirects } from '@svelteload/payload/utils/redirectStore'

type Cookies = Parameters<RequestHandler>[0]['cookies']

const SESSION_MAX_AGE = 7 * 24 * 60 * 60

const sessionFrom = (cookies: Cookies): SessionUser | null => {
    const token = cookies.get(AUTH_COOKIE_NAME)
    return token ? verifySessionToken(token) : null
}

const loadUser = async (payload: Awaited<ReturnType<typeof getPayloadInstance>>, id: string) =>
    payload.findByID({ collection: 'users' as any, id: id as any, depth: 0, overrideAccess: true }).catch(() => null)

const titleOf = (doc: Record<string, unknown>): string => {
    const candidates = [doc.name, doc.title]
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
        if (candidate && typeof candidate === 'object') {
            const first = Object.values(candidate as Record<string, unknown>).find(
                (value) => typeof value === 'string' && value.trim(),
            )
            if (typeof first === 'string') return first.trim()
        }
    }
    return ''
}

export const publishHandler: RequestHandler = async ({ request, cookies }) => {
    const session = sessionFrom(cookies)
    if (!session) return json({ error: 'Sign in to publish.' }, { status: 401 })

    let body: { collection?: string; id?: string | number; locale?: string }
    try {
        body = await request.json()
    } catch (_) {
        return json({ error: 'Expected a JSON body.' }, { status: 400 })
    }

    const { collection, id, locale } = body
    if (!collection || id === undefined || id === null) {
        return json({ error: 'collection and id are required.' }, { status: 400 })
    }

    const payload = await getPayloadInstance()
    const user = await loadUser(payload, session.id)
    if (!user) return json({ error: 'That account no longer exists.' }, { status: 401 })

    try {
        const current: any = await payload.findByID({
            collection: collection as any,
            id: id as any,
            locale: locale as any,
            draft: true,
            depth: 0,
            overrideAccess: true,
        })

        const data: Record<string, unknown> = { _status: 'published' }
        if (typeof current?.slug === 'string' && current.slug) data.slug = current.slug
        if (typeof current?.path === 'string' && current.path) data.path = current.path

        await payload.update({
            collection: collection as any,
            id: id as any,
            locale: locale as any,
            draft: false,
            data: data as any,
            user: user as any,
            overrideAccess: false,
        })

        return json({ ok: true })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return json({ error: message }, { status: 403 })
    }
}

export const deleteHandler: RequestHandler = async ({ request, cookies }) => {
    const session = sessionFrom(cookies)
    if (!session) return json({ error: 'Sign in to delete.' }, { status: 401 })

    let body: { collection?: string; id?: string | number; confirmation?: string; redirectTo?: string }
    try {
        body = await request.json()
    } catch (_) {
        return json({ error: 'Expected a JSON body.' }, { status: 400 })
    }

    const collection = body.collection
    const docId = body.id
    if (!collection || docId === undefined || docId === null) {
        return json({ error: 'collection and id are required.' }, { status: 400 })
    }

    const payload = await getPayloadInstance()
    const user = await loadUser(payload, session.id)
    if (!user) return json({ error: 'That account no longer exists.' }, { status: 401 })

    const doc: any = await payload
        .findByID({
            collection: collection as any,
            id: docId as any,
            locale: 'all' as any,
            draft: true,
            depth: 0,
            overrideAccess: true,
        })
        .catch(() => null)

    if (!doc) return json({ error: 'That document no longer exists.' }, { status: 404 })

    const expected = titleOf(doc)
    if (!expected || String(body.confirmation ?? '').trim() !== expected) {
        return json({ error: `Type the exact name to confirm: ${expected}` }, { status: 400 })
    }

    const redirectTo = String(body.redirectTo ?? '/').trim() || '/'
    const paths = (doc.localizedPaths ?? {}) as Record<string, string>

    for (const from of Object.values(paths)) {
        if (typeof from === 'string' && from) {
            await appendRedirect({ payload, from, to: redirectTo })
        }
    }

    await dropPendingRedirects({ payload, collectionSlug: collection, docId })

    await payload.update({
        collection: collection as any,
        id: docId as any,
        draft: true,
        data: { _status: 'draft', deletedAt: new Date().toISOString() } as any,
        user: user as any,
        overrideAccess: false,
        context: { bypassHooks: true },
    })

    return json({ ok: true, redirectTo })
}

export const uploadHandler: RequestHandler = async ({ request, cookies }) => {
    const session = sessionFrom(cookies)
    if (!session) return json({ error: 'Sign in to upload.' }, { status: 401 })

    let form: FormData
    try {
        form = await request.formData()
    } catch (_) {
        return json({ error: 'Expected a multipart upload.' }, { status: 400 })
    }

    const file = form.get('file')
    if (!(file instanceof File)) return json({ error: 'No file was attached.' }, { status: 400 })

    const payload = await getPayloadInstance()
    const user = await loadUser(payload, session.id)
    if (!user) return json({ error: 'That account no longer exists.' }, { status: 401 })

    const buffer = Buffer.from(await file.arrayBuffer())

    try {
        const doc: any = await payload.create({
            collection: 'media' as any,
            data: {} as any,
            file: { data: buffer, mimetype: file.type, name: file.name, size: buffer.length },
            user: user as any,
            overrideAccess: false,
        })

        return json({ ok: true, id: doc.id, filename: doc.filename, width: doc.width, height: doc.height })
    } catch (err) {
        const forbidden = err instanceof Error && err.name === 'Forbidden'
        const message = forbidden
            ? 'This account is not allowed to add images. Ask whoever runs the site for access.'
            : err instanceof Error
              ? err.message
              : String(err)
        return json({ error: message }, { status: forbidden ? 403 : 400 })
    }
}

export const uploadPageLoad: ServerLoad = async ({ locals, cookies }) => {
    if (!(locals as { isPreview?: boolean }).isPreview) error(404, 'Not Found')
    return { signedIn: sessionFrom(cookies) !== null }
}

export const uploadPageActions: Actions = {
    default: async ({ request, cookies, url }) => {
        const form = await request.formData()
        const email = String(form.get('email') ?? '').trim()
        const password = String(form.get('password') ?? '')
        if (!email || !password) return fail(400, { error: 'Fill in both fields.' })

        const rejected = { error: 'Those details did not match an account on this site.' }

        try {
            const payload = await getPayloadInstance()
            const result = await payload.login({ collection: 'users' as any, data: { email, password } })
            const token = (result as { token?: string }).token
            if (!token) return fail(401, rejected)

            const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
            cookies.set(AUTH_COOKIE_NAME, token, {
                path: '/',
                httpOnly: true,
                secure: !loopback,
                sameSite: 'lax',
                maxAge: SESSION_MAX_AGE,
            })
            return { signedIn: true }
        } catch (_) {
            return fail(401, rejected)
        }
    },
}
