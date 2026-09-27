/**
 * Profile image storage — presign, verify, and delete profile photos on S3.
 *
 * Reuses the same S3 configuration as expense documents (the `S3_UPLOAD_*`
 * env vars, gated behind `NEXT_PUBLIC_ENABLE_EXPENSE_DOCUMENTS`). When that
 * storage is not configured, every operation throws `ImageStorageUnavailableError`
 * so callers can surface a clear "unavailable" state.
 *
 * Security (see design.md): a profile image URL must be a key produced by this
 * app's own presign, never an arbitrary external URL. `presignProfileImage`
 * issues a scoped key together with an HMAC signature bound to the user; only a
 * `{ key, signature }` pair this presign just issued verifies, so `setImage`
 * cannot be tricked into pointing a user's image at an attacker-controlled
 * object or an unrelated key.
 */

import { env } from '@/lib/env'
import { randomId } from '@/lib/random-id'
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createHmac, timingSafeEqual } from 'crypto'

/** Thrown when object storage is not configured. */
export class ImageStorageUnavailableError extends Error {
  readonly code = 'IMAGE_STORAGE_UNAVAILABLE'
  constructor(message = 'Image storage is not configured') {
    super(message)
    this.name = 'ImageStorageUnavailableError'
  }
}

/** Allowed upload content types and their file extensions. */
const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const KEY_PREFIX = 'profile-image'
const PRESIGN_EXPIRES_SECONDS = 60 * 5 // 5 minutes to complete the upload

type S3Config = {
  bucket: string
  region: string
  key: string
  secret: string
  endpoint?: string
}

/**
 * Reads the shared S3 configuration. Returns null when any required value is
 * missing, which is the same condition the app treats as "documents disabled".
 */
function readS3Config(): S3Config | null {
  if (
    !env.NEXT_PUBLIC_ENABLE_EXPENSE_DOCUMENTS ||
    !env.S3_UPLOAD_BUCKET ||
    !env.S3_UPLOAD_KEY ||
    !env.S3_UPLOAD_REGION ||
    !env.S3_UPLOAD_SECRET
  ) {
    return null
  }
  return {
    bucket: env.S3_UPLOAD_BUCKET,
    region: env.S3_UPLOAD_REGION,
    key: env.S3_UPLOAD_KEY,
    secret: env.S3_UPLOAD_SECRET,
    endpoint: env.S3_UPLOAD_ENDPOINT,
  }
}

/** True when profile images can be stored (object storage is configured). */
export function isImageStorageConfigured(): boolean {
  return readS3Config() !== null
}

/** Requires storage to be configured, throwing the typed error otherwise. */
function requireS3Config(): S3Config {
  const config = readS3Config()
  if (!config) {
    throw new ImageStorageUnavailableError()
  }
  return config
}

function createS3Client(config: S3Config): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    // Path style is only needed for non-AWS providers (e.g. MinIO).
    forcePathStyle: !!config.endpoint,
    credentials: {
      accessKeyId: config.key,
      secretAccessKey: config.secret,
    },
  })
}

/**
 * Builds the public URL for an object key, matching the layout `next-s3-upload`
 * produces: path-style for custom endpoints, virtual-hosted-style for AWS.
 */
function publicUrlForKey(config: S3Config, key: string): string {
  if (config.endpoint) {
    const base = config.endpoint.replace(/\/+$/, '')
    return `${base}/${config.bucket}/${key}`
  }
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`
}

/**
 * HMAC that ties a key to a specific user. The S3 upload secret is the signing
 * key: it only exists when storage is configured, and it never leaves the
 * server. Including the userId prevents replaying another user's issued key.
 */
function signKey(config: S3Config, userId: string, key: string): string {
  return createHmac('sha256', config.secret)
    .update(`${userId}:${key}`)
    .digest('hex')
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export type PresignedProfileImage = {
  /** Presigned S3 URL the client PUTs the resized JPEG to. */
  uploadUrl: string
  /** The object key. Pass this back to `setImage` with the signature. */
  key: string
  /** HMAC proving this presign issued the key. Pass back to `setImage`. */
  signature: string
  /** The stored/public URL that `setImage` will write to `User.image`. */
  publicUrl: string
  /** Content type the client must send on the PUT. */
  contentType: string
}

/**
 * Presigns a PUT for a new profile image and returns a signed key. Reuses the
 * expense-documents S3 client and bucket. Throws `ImageStorageUnavailableError`
 * when storage is not configured.
 */
export async function presignProfileImage(
  userId: string,
  contentType: string,
): Promise<PresignedProfileImage> {
  const config = requireS3Config()

  const extension = CONTENT_TYPE_EXTENSIONS[contentType]
  if (!extension) {
    throw new Error(`Unsupported image content type: ${contentType}`)
  }

  const key = `${KEY_PREFIX}/${userId}/${randomId()}.${extension}`

  const client = createS3Client(config)
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: PRESIGN_EXPIRES_SECONDS },
  )

  return {
    uploadUrl,
    key,
    signature: signKey(config, userId, key),
    publicUrl: publicUrlForKey(config, key),
    contentType,
  }
}

/**
 * Verifies that `{ key, signature }` was issued by `presignProfileImage` for
 * this user, and returns the public URL to store. Throws when storage is
 * unavailable, and returns null when the signature does not match or the key is
 * not in this user's profile-image namespace.
 */
export function resolveIssuedImageUrl(
  userId: string,
  key: string,
  signature: string,
): string | null {
  const config = requireS3Config()

  // The key must live in this user's own profile-image namespace. This blocks
  // pointing the image at an unrelated object even if a signature were forged.
  if (!key.startsWith(`${KEY_PREFIX}/${userId}/`)) {
    return null
  }

  const expected = signKey(config, userId, key)
  if (!safeEqualHex(expected, signature)) {
    return null
  }

  return publicUrlForKey(config, key)
}

/**
 * Deletes a stored profile image object. Best-effort: a missing object is not
 * treated as an error. Throws `ImageStorageUnavailableError` when storage is
 * not configured.
 */
export async function deleteProfileImage(imageUrl: string): Promise<void> {
  const config = requireS3Config()

  const key = keyFromUrl(config, imageUrl)
  if (!key) return

  const client = createS3Client(config)
  await client.send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
  )
}

/** Extracts the object key from a stored public URL, or null if it cannot. */
function keyFromUrl(config: S3Config, imageUrl: string): string | null {
  try {
    const url = new URL(imageUrl)
    const path = url.pathname.replace(/^\/+/, '')
    if (config.endpoint) {
      // Path-style: /bucket/key
      const parts = path.split('/')
      if (parts[0] === config.bucket) {
        return parts.slice(1).join('/')
      }
      return path
    }
    // Virtual-hosted-style: bucket is in the hostname, path is the key.
    return path
  } catch {
    return null
  }
}
