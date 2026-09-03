'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { addTagToTaggedPosts, searchTags } from '@/lib/data/tags'
import { parseTagInput, TAG_CATEGORIES, type TagCategory } from '@/lib/tags'

// Postgres' unique_violation. `tags.name` is the only unique column on the table, so
// this always means "that name is already a tag" — the one failure both the create and
// the rename below have to explain rather than hand back as a database message.
const UNIQUE_VIOLATION = '23505'

/**
 * The typed-in name, normalized the way an upload's tag box normalizes it — same
 * lowercasing, same character rule — so a tag created here and a tag created by an
 * upload can never differ in form. A space is what starts a second name, which is why
 * two tokens is an error and not a silent "we took the first one".
 */
function readTagName(raw: FormDataEntryValue | null): { name: string } | { error: string } {
  const parsed = z.string().max(64).safeParse(raw)
  if (!parsed.success) return { error: 'That name is too long — 64 characters at most.' }

  const { tags, invalid } = parseTagInput(parsed.data)
  if (invalid.length > 0) {
    return { error: `“${invalid[0]}” can only use lowercase letters, digits and _ ( ) . -` }
  }
  if (tags.length === 0) return { error: 'Type a tag name.' }
  if (tags.length > 1) return { error: 'One tag at a time — the space starts a second name.' }
  return { name: tags[0] }
}

export type CreateTagState =
  { error: string; ok?: never; name?: never } | { ok: true; name: string; error?: never } | null

/**
 * Add a tag nobody has used yet. Uploads create tags as a side effect of applying them,
 * so this exists for the other order: naming an artist or a series first and tagging
 * posts with it afterwards, with the category already right. It starts on no posts, so
 * `post_count` keeps its default of 0 and no counter needs syncing.
 */
export async function createTag(
  _prevState: CreateTagState,
  formData: FormData
): Promise<CreateTagState> {
  await requireUser()

  const name = readTagName(formData.get('name'))
  if ('error' in name) return { error: name.error }

  const category = z.enum(TAG_CATEGORIES).safeParse(formData.get('category') ?? 'general')
  if (!category.success) return { error: 'Pick a category.' }

  const supabase = await createClient()
  const { error } = await supabase.from('tags').insert({ name: name.name, category: category.data })
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { error: `${name.name} already exists.` }
    return { error: `Could not create the tag: ${error.message}` }
  }

  revalidatePath('/', 'layout')
  return { ok: true, name: name.name }
}

export type ApplyTagState =
  | { error: string; ok?: never }
  | { ok: true; target: string; condition: string; added: number; already: number; error?: never }
  | null

/**
 * Apply one tag to every post that already carries another — the bulk edit behind the
 * "Apply by tag" panel on /tags/manage.
 *
 * Both names go through `readTagName`, so this rejects the same input the tag box does
 * and for the same reasons. Applying a tag to the posts that already have it is refused
 * rather than treated as a no-op: it can only be a mistake, and the result it would
 * report ("0 added, 812 already had it") reads like a failure anyway.
 *
 * The work is in lib/data/tags.ts and the failures come back as messages rather than a
 * thrown error, because every one of them is something the typist can fix in the field
 * still on screen — an unknown condition tag, most of all.
 */
export async function applyTagToTagged(
  _prevState: ApplyTagState,
  formData: FormData
): Promise<ApplyTagState> {
  await requireUser()

  const target = readTagName(formData.get('tag'))
  if ('error' in target) return { error: target.error }
  const condition = readTagName(formData.get('exist'))
  if ('error' in condition) return { error: condition.error }
  if (target.name === condition.name) {
    return { error: 'Those are the same tag — every matching post already has it.' }
  }

  let result
  try {
    result = await addTagToTaggedPosts(target.name, condition.name)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not apply the tag.' }
  }

  // Post counts, the tag colours and the tag lists on every post that just changed
  revalidatePath('/', 'layout')
  return {
    ok: true,
    target: target.name,
    condition: condition.name,
    added: result.added,
    already: result.already,
  }
}

const renameSchema = z.object({ id: z.coerce.number().int() })

export type RenameTagState =
  { error: string; ok?: never; name?: never } | { ok: true; name: string; error?: never } | null

/**
 * Rename a tag in place. The row keeps its id, so every `post_tags` link and every
 * `/tags/[id]` link survives untouched — only the text moves, and with it the searches
 * that spell the old name. Nothing is recounted: the same posts carry the same tag.
 *
 * A name already taken is refused rather than merged. Folding two tags into one means
 * moving links and recounting both, and doing that silently behind a rename would be a
 * destructive edit wearing a cosmetic one's clothes.
 */
export async function renameTag(
  _prevState: RenameTagState,
  formData: FormData
): Promise<RenameTagState> {
  await requireUser()

  const id = renameSchema.safeParse({ id: formData.get('id') })
  if (!id.success) return { error: id.error.issues[0].message }

  const name = readTagName(formData.get('name'))
  if ('error' in name) return { error: name.error }

  const supabase = await createClient()
  const { error } = await supabase.from('tags').update({ name: name.name }).eq('id', id.data.id)
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { error: `${name.name} is already a tag — rename it to something else.` }
    }
    return { error: `Rename failed: ${error.message}` }
  }

  // The name is painted on the grid's tag links, both tag screens and every post page
  revalidatePath('/', 'layout')
  return { ok: true, name: name.name }
}

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
 * post_tags has no cascade from tags, so its rows go first or the foreign key
 * refuses the delete.
 *
 * No counter to recount: the only `post_count` these links fed belongs to the tag
 * being deleted, and no post changes rating. Other tags on those posts keep every
 * link they had.
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
