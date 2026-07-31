import { env } from '$env/dynamic/private'

export async function notifyDiscord(title: string, message: string, color: number): Promise<void> {
    const webhook = env.DISCORD_WEBHOOK_URL
    if (!webhook) return
    try {
        await fetch(webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{ title, description: message, color, timestamp: new Date().toISOString() }],
            }),
        })
    } catch (error) {
        console.error('Discord notification failed:', error)
    }
}
