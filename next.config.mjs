import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n.ts')

/**
 * Undefined entries are not supported. Push optional patterns to this array only if defined.
 * @type {import('next/dist/shared/lib/image-config').RemotePattern}
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
  }

  remotePatterns.push(pattern)

  // Support additional hostnames/IPs for homelab setups (e.g., local network + Tailscale)
  // Format: comma-separated list, e.g., "192.168.5.94,100.90.37.91"
  // Note: This must be set at build time, not runtime
  if (process.env.IMAGE_ALLOWED_HOSTNAMES) {
    const additionalHostnames = process.env.IMAGE_ALLOWED_HOSTNAMES.split(
      ',',
    ).map((h) => h.trim())
    additionalHostnames.forEach((hostname) => {
      if (hostname && hostname !== url.hostname) {
        const additionalPattern = {
          hostname,
        }
        if (url.protocol === 'http:') {
          additionalPattern.protocol = 'http'
        }
        if (url.port) {
          additionalPattern.port = url.port
        }
        if (url.pathname && url.pathname !== '/') {
          additionalPattern.pathname = `${url.pathname.replace(/\/$/, '')}/**`
        }
        remotePatterns.push(additionalPattern)
      }
    })
  }

  // Log the patterns for debugging (only in development)
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      'Next.js image remote patterns configured:',
      JSON.stringify(remotePatterns, null, 2),
    )
  }
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
  },
  // Required to run in a codespace (see https://github.com/vercel/next.js/issues/58019)
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
}

export default withNextIntl(nextConfig)
