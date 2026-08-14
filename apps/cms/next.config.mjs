import path from 'path'
import { fileURLToPath } from 'url'
import { withPayload } from '@payloadcms/next/withPayload'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: path.resolve(__dirname, '../../..'),
  },
  async redirects() {
    return [
      { source: '/', destination: '/admin', permanent: true },
    ]
  },
  async rewrites() {
    return [
      { source: '/.well-known/oauth-authorization-server/:path*', destination: '/oauth/metadata/authorization-server' },
      { source: '/.well-known/oauth-authorization-server', destination: '/oauth/metadata/authorization-server' },
      { source: '/.well-known/oauth-protected-resource/:path*', destination: '/oauth/metadata/protected-resource' },
      { source: '/.well-known/oauth-protected-resource', destination: '/oauth/metadata/protected-resource' },
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
