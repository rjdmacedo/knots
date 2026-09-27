/**
 * Unit tests for the profile-image presign/verify logic.
 *
 * Feature: account-settings-page (task 1.3)
 *
 * Focus is the security requirement from design.md: a profile image must be a
 * key this app's presign issued, never an arbitrary external URL. So we test
 * the presign -> verify round-trip and that forged or foreign keys are refused,
 * plus the typed unavailable error when S3 env is missing.
 */

// Mutable env stand-in so each test can toggle S3 configuration.
const mockEnv: Record<string, unknown> = {}

jest.mock('@/lib/env', () => ({
  get env() {
    return mockEnv
  },
}))

// Avoid pulling nanoid's ESM build into jest; deterministic id is enough here.
let idCounter = 0
jest.mock('@/lib/random-id', () => ({
  randomId: () => `id${idCounter++}`,
}))

// The AWS SDK's real S3Client fails to construct under jest's runtime
// (`awsCheckVersion is not a function`), so stub the client and commands. This
// test targets our own key/signature logic, not the SDK.
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => ({
    input,
  })),
  DeleteObjectCommand: jest.fn().mockImplementation((input: unknown) => ({
    input,
  })),
}))

// A signed URL that echoes its key so assertions can inspect it without a
// network call. The real getSignedUrl is not exercised here.
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(
    async (_client: unknown, command: { input: { Key: string } }) =>
      `https://signed.example/${command.input.Key}`,
  ),
}))

function configureS3() {
  mockEnv.NEXT_PUBLIC_ENABLE_EXPENSE_DOCUMENTS = true
  mockEnv.S3_UPLOAD_BUCKET = 'knots-bucket'
  mockEnv.S3_UPLOAD_KEY = 'access-key'
  mockEnv.S3_UPLOAD_SECRET = 'super-secret'
  mockEnv.S3_UPLOAD_REGION = 'eu-west-1'
  mockEnv.S3_UPLOAD_ENDPOINT = undefined
}

function disableS3() {
  for (const key of Object.keys(mockEnv)) delete mockEnv[key]
  mockEnv.NEXT_PUBLIC_ENABLE_EXPENSE_DOCUMENTS = false
}

import {
  ImageStorageUnavailableError,
  isImageStorageConfigured,
  presignProfileImage,
  resolveIssuedImageUrl,
} from './profile-image'

describe('profile-image storage configuration', () => {
  it('reports configured only when all S3 vars and the documents flag are set', () => {
    configureS3()
    expect(isImageStorageConfigured()).toBe(true)

    disableS3()
    expect(isImageStorageConfigured()).toBe(false)
  })

  it('reports not configured when the documents flag is off even with S3 vars', () => {
    configureS3()
    mockEnv.NEXT_PUBLIC_ENABLE_EXPENSE_DOCUMENTS = false
    expect(isImageStorageConfigured()).toBe(false)
  })
})

describe('presignProfileImage', () => {
  beforeEach(configureS3)

  it('issues a scoped key under the user namespace and a presigned URL', async () => {
    const result = await presignProfileImage('user-1', 'image/jpeg')

    expect(result.key.startsWith('profile-image/user-1/')).toBe(true)
    expect(result.key.endsWith('.jpg')).toBe(true)
    expect(result.uploadUrl).toContain(result.key)
    expect(result.publicUrl).toBe(
      `https://knots-bucket.s3.eu-west-1.amazonaws.com/${result.key}`,
    )
    expect(result.signature).toHaveLength(64) // sha256 hex
  })

  it('rejects unsupported content types', async () => {
    await expect(presignProfileImage('user-1', 'image/gif')).rejects.toThrow(
      /Unsupported image content type/,
    )
  })

  it('throws ImageStorageUnavailableError when S3 is not configured', async () => {
    disableS3()
    await expect(
      presignProfileImage('user-1', 'image/jpeg'),
    ).rejects.toBeInstanceOf(ImageStorageUnavailableError)
  })
})

describe('resolveIssuedImageUrl', () => {
  beforeEach(configureS3)

  it('accepts a key/signature pair this presign just issued', async () => {
    const issued = await presignProfileImage('user-1', 'image/jpeg')

    const url = resolveIssuedImageUrl('user-1', issued.key, issued.signature)
    expect(url).toBe(issued.publicUrl)
  })

  it('rejects a tampered signature', async () => {
    const issued = await presignProfileImage('user-1', 'image/jpeg')

    const tampered = issued.signature.replace(/.$/, (c) =>
      c === '0' ? '1' : '0',
    )
    expect(resolveIssuedImageUrl('user-1', issued.key, tampered)).toBeNull()
  })

  it("rejects another user's issued key (signature is user-bound)", async () => {
    const issued = await presignProfileImage('user-1', 'image/jpeg')

    // user-2 presents user-1's key and signature.
    expect(
      resolveIssuedImageUrl('user-2', issued.key, issued.signature),
    ).toBeNull()
  })

  it('rejects a key outside the user profile-image namespace', () => {
    // An attacker-chosen key, even with a correct-looking signature, must not
    // resolve because the namespace prefix check fails first.
    expect(
      resolveIssuedImageUrl('user-1', 'some/external/object.jpg', 'deadbeef'),
    ).toBeNull()
  })

  it('throws ImageStorageUnavailableError when S3 is not configured', () => {
    disableS3()
    expect(() =>
      resolveIssuedImageUrl('user-1', 'profile-image/user-1/x.jpg', 'sig'),
    ).toThrow(ImageStorageUnavailableError)
  })
})
