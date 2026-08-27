'use server'

import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPostByMd5 } from '@/lib/data/posts'
import { originalPath, thumbnailPath } from '@/lib/storage'
import { revalidatePath } from 'next/cache'

// Keep under Vercel's server-action body limit; switch to signed upload URLs
// when this first hurts (docs/architecture.md).
const MAX_FILE_SIZE = 8 * 1024 * 1024
const THUMB_MAX = 400

const FORMAT_TO_EXT: Record<string, string> = {
  jpeg: 'jpg',
  png: 'png',
  gif: 'gif',
  webp: 'webp',
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
}

export type UploadResult =
  | { ok: true; postId: number }
  | { ok: false; error: string; existingPostId?: number }

/**
 * Drop-to-upload: no form, no metadata. Every upload lands as `general` with no
 * tags at all; the uploader adds tags/rating/source later from the edit page.
 */
export async function uploadPost(formData: FormData): Promise<UploadResult> {
  await requireUser()

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Pick an image file' }
  }
  if (file.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `File is too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  let width: number | undefined
  let height: number | undefined
  let ext: string | undefined
  try {
    const meta = await sharp(buffer).metadata()
    width = meta.width
    height = meta.height
    ext = meta.format ? FORMAT_TO_EXT[meta.format] : undefined
  } catch {
    return { ok: false, error: 'File is not a readable image' }
  }
  if (!ext || !width || !height) {
    return { ok: false, error: 'Unsupported format (jpg/png/gif/webp only)' }
  }

  const md5 = createHash('md5').update(buffer).digest('hex')

  const existing = await getPostByMd5(md5)
  if (existing) {
    return {
      ok: false,
      error: 'This image already exists',
      existingPostId: existing.id,
    }
  }

  // First frame only for animated inputs — thumbnails stay static
  const thumb = await sharp(buffer)
    .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer()

  // Storage writes need the service-role client (RLS floor is signed-in-only anyway)
  const storage = createAdminClient().storage
  const origUpload = await storage.from('originals').upload(originalPath(md5, ext), buffer, {
    contentType: CONTENT_TYPES[ext],
    upsert: false,
  })
  if (origUpload.error) {
    return { ok: false, error: `Storage upload failed: ${origUpload.error.message}` }
  }
  const thumbUpload = await storage.from('thumbnails').upload(thumbnailPath(md5), thumb, {
    contentType: 'image/webp',
    upsert: true,
  })
  if (thumbUpload.error) {
    await storage.from('originals').remove([originalPath(md5, ext)])
    return { ok: false, error: `Thumbnail upload failed: ${thumbUpload.error.message}` }
  }

  // RPC runs on the user's session — auth.uid() must be the uploader, not service role
  const supabase = await createClient()
  const { data: postId, error: rpcError } = await supabase.rpc('create_post_with_tags', {
    p_md5: md5,
    p_file_ext: ext,
    p_file_size: buffer.length,
    p_width: width,
    p_height: height,
    p_rating: 'general',
    p_source_url: '',
    p_tags: [],
  })
  if (rpcError) {
    // Roll back storage so a retry starts clean
    await storage.from('originals').remove([originalPath(md5, ext)])
    await storage.from('thumbnails').remove([thumbnailPath(md5)])
    return { ok: false, error: `Database insert failed: ${rpcError.message}` }
  }

  revalidatePath('/')
  return { ok: true, postId: postId as number }
}
