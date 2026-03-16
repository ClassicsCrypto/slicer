import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const R2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const BUCKET = process.env.R2_BUCKET_NAME || 'slicer-videos'

export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array | ReadableStream,
  contentType: string
): Promise<string> {
  await R2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body as Buffer,
      ContentType: contentType,
    })
  )
  return key
}

export async function deleteFromR2(key: string): Promise<void> {
  await R2.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  )
}

export async function getSignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  })
  return getSignedUrl(R2, command, { expiresIn })
}

export async function getSignedUploadUrl(key: string, contentType: string, expiresIn = 3600): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(R2, command, { expiresIn })
}

export function getPublicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_URL || ''
  return `${base}/${key}`
}
