'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { searchTags } from '@/lib/data/tags'
import { TAG_CATEGORIES, type TagCategory } from '@/lib/tags'

const categorySchema = z.object({
  id: z.coerce.number().int(),
  category: z.enum(TAG_CATEGORIES),
})

export type TagCategoryState = { error: string; ok?: never } | { ok: true; error?: never } | null

/**
 * Recategorize one tag. Category is cosmetic — it only drives the colour and the
 * grouping — so the tag's name, id and post links are untouched and nothing has to
 * be recounted.
 */
export async function updateTagCategory(
  _prevState: TagCategoryState,
  formData: FormData
): Promise<TagCategoryState> {
  await requireUser()

  const parsed = categorySchema.safeParse({
    id: formData.get('id'),
    category: formData.get('category'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('tags')
    .update({ category: parsed.data.category })
    .eq('id', parsed.data.id)
  if (error) {
    return { error: `Update failed: ${error.message}` }
  }

  // Tag colours are painted on the grid, the post pages and both tag screens
  revalidatePath('/', 'layout')
  return { ok: true }
}

const deleteSchema = z.object({ id: z.coerce.number().int() })

export type DeleteTagState = { error: string; ok?: never } | { ok: true; error?: never } | null

/**
 * Remove a tag from the board entirely — it comes off every post that carries it.
 * post_tags has no cascade from tags, so its rows go first; that also lets the
 * post_count trigger unwind the counter before the row it points at disappears.
 */
export async function deleteTag(
  _prevState: DeleteTagState,
  formData: FormData
): Promise<DeleteTagState> {
  await requireUser()

  const parsed = deleteSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { error: linkError } = await supabase
    .from('post_tags')
    .delete()
    .eq('tag_id', parsed.data.id)
  if (linkError) {
    return { error: `Delete failed: ${linkError.message}` }
  }

  const { error } = await supabase.from('tags').delete().eq('id', parsed.data.id)
  if (error) {
    return { error: `Delete failed: ${error.message}` }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

export type TagSuggestion = { name: string; category: TagCategory; post_count: number }

/**
 * Autocomplete for the tag field. Read-only, but gated like the field it serves —
 * the tag list is only quietly interesting, and there's no reason to hand an
 * unauthenticated caller a search endpoint over it.
 */
export async function suggestTags(query: string): Promise<TagSuggestion[]> {
  await requireUser()

  const parsed = z.string().max(64).safeParse(query)
  if (!parsed.success) return []

  const tags = await searchTags(parsed.data)
  return tags.map(({ name, category, post_count }) => ({ name, category, post_count }))
}
