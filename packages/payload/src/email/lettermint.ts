export const LETTERMINT_SMTP_HOST = 'smtp.lettermint.co'
export const LETTERMINT_SMTP_PORT = 587
export const LETTERMINT_SMTP_USER = 'lettermint'

export type LettermintTransportOptions = {
    host: string
    port: number
    secure: boolean
    auth: {
        user: string
        pass: string
    }
    dnsTimeout: number
    connectionTimeout: number
    greetingTimeout: number
    socketTimeout: number
}

export function lettermintTransportOptions(apiKey: string): LettermintTransportOptions {
    const pass = apiKey?.trim()
    if (!pass) throw new Error('Lettermint API key is missing.')

    return {
        host: LETTERMINT_SMTP_HOST,
        port: LETTERMINT_SMTP_PORT,
        secure: false,
        auth: {
            user: LETTERMINT_SMTP_USER,
            pass,
        },
        // Nodemailer's defaults run to minutes (120s connect, 600s socket, 30s DNS).
        // A serverless function is dead long before that, so fail fast enough that
        // the caller still gets to log the error and notify.
        dnsTimeout: 5_000,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
    }
}
