import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n.ts')

/**
 * Undefined entries are not supported. Push optional patterns to this array only if defined.
 * @type {import('next/dist/shared/lib/image-config').RemotePattern[]}
 */
const remotePatterns = []

// S3 Storage
if (process.env.S3_UPLOAD_ENDPOINT) {
  // custom endpoint for providers other than AWS
  const url = new URL(process.env.S3_UPLOAD_ENDPOINT)
  const pattern = {
    hostname: url.hostname,
  }

  // Include protocol if not https (for local storage servers)
  if (url.protocol === 'http:') {
    pattern.protocol = 'http'
  }

  // Include port if specified
  if (url.port) {
    pattern.port = url.port
  }

  // Include pathname pattern if specified (use wildcard to allow subpaths)
  if (url.pathname && url.pathname !== '/') {
    // Use the actual pathname from the URL, ensuring it ends with '/**'
    pattern.pathname = `${url.pathname.replace(/\/$/, '')}/**`
  } else if (process.env.S3_UPLOAD_BUCKET) {
    // For path-style addressing (MinIO), include bucket name in pathname
    // Images are accessed as: http://endpoint/bucket-name/document-...
    pattern.pathname = `/${process.env.S3_UPLOAD_BUCKET}/**`
  }

  remotePatterns.push(pattern)
} else if (process.env.S3_UPLOAD_BUCKET && process.env.S3_UPLOAD_REGION) {
  // default provider
  remotePatterns.push({
    hostname: `${process.env.S3_UPLOAD_BUCKET}.s3.${process.env.S3_UPLOAD_REGION}.amazonaws.com`,
  })
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns,
    // Disable image optimization for homelab setups with private IPs
    // Next.js blocks private IPs by default for security, so we disable optimization
    // Images will be served directly from MinIO without Next.js optimization
    unoptimized: process.env.NODE_ENV === 'development' || !!process.env.S3_UPLOAD_ENDPOINT,
  },
  // Required to run in a codespace (see https://github.com/vercel/next.js/issues/58019)
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
}

export default withNextIntl(nextConfig)
