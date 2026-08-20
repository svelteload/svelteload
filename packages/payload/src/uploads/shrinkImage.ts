import { MAX_UPLOAD_DIMENSION, MIN_MASTER_DIMENSION } from '../imageSizes'

const REENCODABLE = new Set(['image/jpeg', 'image/png', 'image/webp'])

/**
 * Vercel rejects a serverless request body over 4.5MB, and the multipart wrapper plus the
 * _payload JSON field share that budget with the file.
 */
const TARGET_BYTES = 3_500_000

const QUALITY = 0.92
const STEP = 0.85

const toWebpName = (name: string) => `${name.replace(/\.[^.]+$/, '')}.webp`

async function encodeAt(bitmap: ImageBitmap, longestSide: number): Promise<Blob | null> {
    const scale = longestSide / Math.max(bitmap.width, bitmap.height)

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)

    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY))
}

export async function shrinkImage(file: File): Promise<File> {
    if (!REENCODABLE.has(file.type)) return file
    if (file.size <= TARGET_BYTES) return file

    let bitmap: ImageBitmap
    try {
        bitmap = await createImageBitmap(file)
    } catch {
        return file
    }

    const longest = Math.max(bitmap.width, bitmap.height)
    const floor = Math.min(longest, MIN_MASTER_DIMENSION)

    let side = Math.min(longest, MAX_UPLOAD_DIMENSION)
    let encoded: Blob | null = null

    while (true) {
        encoded = await encodeAt(bitmap, side)
        if (!encoded || encoded.size <= TARGET_BYTES || side <= floor) break
        side = Math.max(floor, Math.round(side * STEP))
    }

    bitmap.close()

    if (!encoded || encoded.size >= file.size) return file

    return new File([encoded], toWebpName(file.name), {
        type: 'image/webp',
        lastModified: file.lastModified,
    })
}
