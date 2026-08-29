'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPostFromImage, parsePostMetadata } from '@/lib/upload/pipeline'
import { WEB_UPLOAD_LIMITS } from '@/lib/upload-limits'

export type { UploadResult } from '@/lib/upload/pipeline'
import type { UploadResult } from '@/lib/upload/pipeline'

/**
 * Creates one post from one staged file. The uploader reviews and tags each image
 * before submitting, so `tags`, `rating` and `source_url` arrive with the bytes;
 * they still default to an untagged `general` post when the caller omits them.
 *
 * One file per call: each image is its own post, its own failure, and its own row
 * in the queue's progress list.
 *
 * Everything past getting the bytes out of the request is `lib/upload/pipeline.ts`,
 * which the desktop uploader in `packages/post-app` runs too — same compression, same
 * dedupe, same rollback. What is left here is what only exists on the web: the session,
 * the multipart body, and the cache to revalidate.
 */
export async function uploadPost(formData: FormData): Promise<UploadResult> {
  const uploader = await requireUser()

  const parsed = parsePostMetadata({
    tags: formData.get('tags') ?? '',
    rating: formData.get('rating') ?? 'general',
    source_url: formData.get('source_url') ?? '',
  })
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Pick an image file' }
  }

  const result = await createPostFromImage(
    await createClient(),
    createAdminClient(),
    uploader.id,
    Buffer.from(await file.arrayBuffer()),
    parsed.metadata,
    WEB_UPLOAD_LIMITS
  )

  if (result.ok) revalidatePath('/')
  return result
}
