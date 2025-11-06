import { env } from '@/lib/env'
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { NextRequest, NextResponse } from 'next/server'

const s3Client = new S3Client({
  region: env.S3_UPLOAD_REGION || 'us-east-1',
  endpoint: env.S3_UPLOAD_ENDPOINT,
  forcePathStyle: !!env.S3_UPLOAD_ENDPOINT,
  credentials: {
    accessKeyId: env.S3_UPLOAD_KEY || '',
    secretAccessKey: env.S3_UPLOAD_SECRET || '',
  },
})

/**
 * Parse S3 URL to extract bucket and key
 * Handles both path-style (MinIO) and virtual-hosted-style (AWS) URLs
 */
function parseS3Url(url: string): { bucket: string; key: string } | null {
  try {
    const urlObj = new URL(url)

    // If we have a custom endpoint (MinIO), use path-style parsing
    if (env.S3_UPLOAD_ENDPOINT) {
      // Path-style: http://endpoint/bucket/key or http://endpoint/bucket/key/path
      const pathParts = urlObj.pathname.replace(/^\/+/, '').split('/')
      if (pathParts.length < 2) return null

      const bucket = pathParts[0]
      const key = pathParts.slice(1).join('/')
      return { bucket, key }
    }

    // Virtual-hosted-style (AWS): https://bucket.s3.region.amazonaws.com/key
    const hostnameParts = urlObj.hostname.split('.')
    if (hostnameParts.length >= 4 && hostnameParts[1] === 's3') {
      const bucket = hostnameParts[0]
      const key = urlObj.pathname.replace(/^\/+/, '')
      return { bucket, key }
    }

    // Fallback: use configured bucket and extract key from pathname
    if (env.S3_UPLOAD_BUCKET) {
      const key = urlObj.pathname.replace(/^\/+/, '')
      return { bucket: env.S3_UPLOAD_BUCKET, key }
    }

    return null
  } catch {
    return null
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const url = searchParams.get('url')

    if (!url) {
      return NextResponse.json(
        { error: 'Missing url parameter' },
        { status: 400 },
      )
    }

    const parsed = parseS3Url(url)
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid S3 URL format' },
        { status: 400 },
      )
    }

    const { bucket, key } = parsed

    if (!bucket || !key) {
      return NextResponse.json(
        { error: 'Could not extract bucket or key from URL' },
        { status: 400 },
      )
    }

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete S3 object:', error)
    return NextResponse.json(
      { error: 'Failed to delete object from storage' },
      { status: 500 },
    )
  }
}
