import { headers as nextHeaders } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { UploadDropzone } from './UploadDropzone'

export const dynamic = 'force-dynamic'

export const metadata = {
    title: 'Upload images',
    robots: { index: false, follow: false },
}

export default async function UploadPage() {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: await nextHeaders() })

    if (!user) redirect(`/admin/login?redirect=${encodeURIComponent('/upload')}`)

    return <UploadDropzone />
}
