import path from 'path'
import { fileURLToPath } from 'url'
import { withPayload } from '@payloadcms/next/withPayload'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The cms app lives inside the svelteload submodule. The svelteload repo
  // has its own pnpm-workspace.yaml so it can be developed standalone, which
  // confuses Next's workspace-root inference when consumed as a submodule.
  // Point at the consuming project's root explicitly to silence the warning
  // and keep monorepo asset resolution stable.
  turbopack: {
    root: path.resolve(__dirname, '../../..'),
  },
  async redirects() {
    return [
      { source: '/', destination: '/admin', permanent: true },
    ]
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
