/**
 * Supabase Storage adapter — drop-in replacement for the original R2 module.
 * Bucket: "slicer-videos" (created via SQL migration or Supabase dashboard)
 */

import { createClient } from '@supabase/supabase-js'

const BUCKET = 'slicer-videos'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function uploadToStorage(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  const supabase = getAdminClient()
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(key, body, { contentType, upsert: true })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  return key
}

export async function deleteFromStorage(key: string): Promise<void> {
  const supabase = getAdminClient()
  await supabase.storage.from(BUCKET).remove([key])
}

export function getPublicUrl(key: string): string {
  const supabase = getAdminClient()
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key)
  return data.publicUrl
}

export async function getSignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  const supabase = getAdminClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(key, expiresIn)
  if (error || !data) throw new Error(`Signed URL failed: ${error?.message}`)
  return data.signedUrl
}
