'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireUser } from '@/lib/auth'
import { parseTagInput } from '@/lib/tags'
import { RATINGS } from '@/lib/search'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deletePostRow, getPost, incrementPostView, updatePostWithTags } from '@/lib/data/posts'
import {
  POSTS_BUCKET,
  THUMBNAILS_BUCKET,
  postImagePath,
  thumbnailPath,
} from '@/lib/storage'

export async function deletePost(formData: FormData) {
  await requireUser()

  const id = Number(formData.get('id'))
  if (!Number.isInteger(id)) throw new Error('Invalid post id')

  const post = await getPost(id)
  if (!post) throw new Error('Post not found')

  // Row first (it cascades post_tags and recounts what that emptied), then files.
  // The order matters: a failed delete leaves the post whole, whereas removing the
  // files first would leave a row pointing at nothing.
  const supabase = await createClient()
  await deletePostRow(supabase, id, post.rating)

  const storage = createAdminClient().storage
  await storage.from(POSTS_BUCKET).remove([postImagePath(post.md5, post.file_ext)])
  await storage.from(THUMBNAILS_BUCKET).remove([thumbnailPath(post.md5)])

  // The gallery, and the front door's post count
  revalidatePath('/posts')
  revalidatePath('/')
  redirect('/posts')
}

const editSchema = z.object({
  id: z.coerce.number().int(),
  tags: z.string(),
  rating: z.enum(RATINGS),
  // Trimmed first: the box wraps, so a pasted link can arrive with stray whitespace
  source_url: z
    .string()
    .trim()
    .pipe(z.union([z.literal(''), z.url('Source must be a valid URL')]))
    .optional(),
})

export type EditPostState = { error: string; ok?: never } | { ok: true; error?: never } | null

export async function updatePost(
  _prevState: EditPostState,
  formData: FormData
): Promise<EditPostState> {
  await requireUser()

  const parsed = editSchema.safeParse({
    id: formData.get('id'),
    tags: formData.get('tags'),
    rating: formData.get('rating'),
    source_url: formData.get('source_url') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  // An empty box is allowed — it clears the post's tags.
  const { tags, invalid } = parseTagInput(parsed.data.tags)
  if (invalid.length > 0) {
    return {
      error: `Invalid tags (lowercase a-z 0-9 _ ( ) . - only): ${invalid.join(', ')}`,
    }
  }

  try {
    await updatePostWithTags(parsed.data.id, {
      rating: parsed.data.rating,
      source_url: parsed.data.source_url ?? '',
      tags,
    })
  } catch (error) {
    return { error: `Update failed: ${error instanceof Error ? error.message : String(error)}` }
  }

  revalidatePath('/posts')
  revalidatePath(`/posts/${parsed.data.id}`)
  return { ok: true }
}

/**
 * Count one view of a post. Deliberately its own action rather than a side effect
 * of getPost() — rendering, prefetching or generating metadata must not inflate the
 * counter, so only an explicit call from the viewer bumps it.
 */
export async function recordPostView(postId: number) {
  if (!Number.isInteger(postId) || postId < 1) return

  // Best effort: a lost view is not worth failing the page over.
  await incrementPostView(postId)
}
