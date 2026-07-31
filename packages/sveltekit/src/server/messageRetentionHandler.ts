import type { RequestHandler } from '@sveltejs/kit'
import { json, error } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import { projectMeta } from 'project-meta/projectMeta'
import { getPayloadInstance } from './payload'
import { notifyDiscord } from './notifyDiscord'

const DEFAULT_RETENTION_MONTHS = 24

// ProjectMeta is declared per project, so a site that has not opted in will not have
// this field on its type. Read it loosely so bumping the submodule pointer does not
// break the projects that are happy with the default.
const retentionMonths = (): number =>
    (projectMeta as { messageRetentionMonths?: number }).messageRetentionMonths ?? DEFAULT_RETENTION_MONTHS

// Deletes early so nothing outlives the retention period the privacy policy promises.
// Covers the gap between daily runs plus up to 3 days of drift, since subtracting
// whole months from two nearby dates can move the cutoff further than the clock moved
// when a leap day falls between them. Raise this if the cron interval grows.
const SWEEP_MARGIN_DAYS = 14

const cutoffDate = (months: number) => {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - months)
    cutoff.setDate(cutoff.getDate() + SWEEP_MARGIN_DAYS)
    return cutoff
}

export const GET: RequestHandler = async ({ request, url }) => {
    const secret = env.CRON_SECRET
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
        error(401, 'Unauthorized')
    }

    const months = retentionMonths()
    const dry = url.searchParams.get('dry') === 'true'
    const cutoff = cutoffDate(months)
    const where = { createdAt: { less_than: cutoff.toISOString() } }

    const payload = await getPayloadInstance()

    if (dry) {
        const { totalDocs } = await payload.find({
            collection: 'messages',
            where,
            limit: 1,
            depth: 0,
            overrideAccess: true,
        })
        return json({ dryRun: true, retentionMonths: months, cutoff: cutoff.toISOString(), wouldDelete: totalDocs })
    }

    let result
    try {
        result = await payload.delete({
            collection: 'messages',
            where,
            depth: 0,
            overrideAccess: true,
        })
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        console.error('Message retention sweep failed:', reason)
        await notifyDiscord(
            'Message Retention Sweep Failed',
            `Contact form messages were not deleted, so the ${months} month retention promise in the privacy policy is not being kept.\n\n**Error:** ${reason}\n**Cutoff:** ${cutoff.toISOString()}`,
            0xe74c3c,
        )
        error(500, 'Retention sweep failed')
    }

    const failed = result.errors ?? []
    if (failed.length) {
        console.error(`Message retention: ${failed.length} deletions failed`, failed)
        await notifyDiscord(
            'Message Retention Sweep Incomplete',
            `${failed.length} of ${failed.length + result.docs.length} messages older than the cutoff could not be deleted.\n\n**Cutoff:** ${cutoff.toISOString()}`,
            0xff6c00,
        )
    }

    console.log(`Message retention: deleted ${result.docs.length} messages older than ${cutoff.toISOString()}`)

    return json({
        dryRun: false,
        retentionMonths: months,
        cutoff: cutoff.toISOString(),
        deleted: result.docs.length,
        failed: failed.length,
    })
}
