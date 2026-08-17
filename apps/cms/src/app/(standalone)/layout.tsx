import type { ReactNode } from 'react'
import './standalone.css'

export default function StandaloneLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}
