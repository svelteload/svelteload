import { DISCORD_WEBHOOK_URL } from '$env/static/private'

export async function notifyDiscord(title: string, message: string, color: number): Promise<void> {
    if (!DISCORD_WEBHOOK_URL) return
    try {
        await fetch(DISCORD_WEBHOOK_URL, {
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
