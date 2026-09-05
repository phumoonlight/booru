import { deletePostRow, updatePostWithTags } from '@common/data/shared'
import { getPost, getPostTags, type Post } from '@common/data/posts'
import { POSTS_BUCKET, postImagePath, THUMBNAILS_BUCKET, thumbnailPath } from '@common/storage'
import { parseTagInput } from '@common/tags'
import { RATINGS, type Rating } from '@common/search'
import type { Tag } from '@common/tags'
import { boardClient } from './supabase'
import { clearTagCache } from './tag-cache'
import { loadConfig } from './config'

/**
 * Managing posts that already exist: load one, rewrite it, delete it.
 *
 * All three were server actions on the website, behind `requireUser()`. They are here
 * now because the website has an anon key and the schema has no write policy for it to
 * use — the board is read-only from a browser, and this is the only program that can
 * change it.
 *
 * The work itself is still `@common/data/shared`, the same functions the upload path
 * calls. What is added here is what the web actions added: the storage objects on the
 * way out, and the cached tag index on the way through.
 */

export type ManageOutcome = { ok: true } | { ok: false; error: string }

export type LoadedPost = {
  post: Post
  tags: Tag[]
}

export async function loadPost(id: number): Promise<LoadedPost | null> {
  const client = boardClient()
  if (!client) return null

  const post = await getPost(client, id)
  if (!post) return null
  return { post, tags: await getPostTags(client, id) }
}

/**
 * Rewrites a post's rating, source and whole tag set — the desktop's version of the
 * edit panel that used to sit on the post page.
 *
 * The tags arrive as the string the field renders, and are parsed with the same
 * `parseTagInput` an upload's are, so a name typed here and a name typed there cannot
 * differ in form. An unusable rating is refused rather than defaulted: silently writing
 * `general` over an explicit post is the kind of quiet wrong answer that only shows up
 * on the public site.
 */
export async function savePost(
  id: number,
  rawTags: string,
  rawRating: string,
  sourceUrl: string
): Promise<ManageOutcome> {
  const client = boardClient()
  if (!client) return { ok: false, error: 'Not set up yet' }

  // The stored code, straight from the editor's <select>, not the query spelling —
  // `asRating` is for the `rating:explicit` a query carries, and this is not one.
  if (!(RATINGS as readonly string[]).includes(rawRating)) {
    return { ok: false, error: `${rawRating} is not a rating on this board.` }
  }
  const rating = rawRating as Rating

  const { tags, invalid } = parseTagInput(rawTags)
  if (invalid.length > 0) {
    return { ok: false, error: `Invalid tags: ${invalid.join(', ')}` }
  }
  if (tags.length === 0) return { ok: false, error: 'A post needs at least one tag.' }

  try {
    await updatePostWithTags(client, id, { rating, source_url: sourceUrl, tags })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save the post.' }
  }

  // An edit can coin a tag, which is the one the next post is about to want.
  clearTagCache()
  return { ok: true }
}

/**
 * Deletes a post and both of its stored images.
 *
 * Row first, files second — the order the web's delete action used and for the same
 * reason: a failed delete leaves the post whole, where removing the files first would
 * leave a row pointing at nothing. The row read comes before either, because the paths
 * derive from `file_name` and nothing stores them.
 */
export async function removePost(id: number): Promise<ManageOutcome> {
  const client = boardClient()
  if (!client) return { ok: false, error: 'Not set up yet' }

  const post = await getPost(client, id)
  if (!post) return { ok: false, error: `Post ${id} not found.` }

  try {
    await deletePostRow(client, id)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Delete failed.' }
  }

  // The row is already gone, so a storage failure is logged rather than reported: it
  // leaves two orphaned objects, which is untidy, and re-reporting it as a failed delete
  // would be wrong about the thing the user actually asked for.
  const storage = client.storage
  const [image, thumb] = await Promise.all([
    storage.from(POSTS_BUCKET).remove([postImagePath(post.file_name, post.file_ext)]),
    storage.from(THUMBNAILS_BUCKET).remove([thumbnailPath(post.file_name)]),
  ])
  if (image.error) console.error('Could not remove the post image:', image.error.message)
  if (thumb.error) console.error('Could not remove the thumbnail:', thumb.error.message)

  clearTagCache()
  return { ok: true }
}

/**
 * A thumbnail as a `data:` URL, for the browse grid.
 *
 * The window's CSP is `img-src 'self' data:` and stays that way. Fetching here costs an
 * IPC round trip per card, which for a screenful of a few dozen is nothing next to
 * loosening the one rule that says the page cannot reach the network. The buckets are
 * public, so this is a plain GET with no key on it.
 *
 * Cached by file name for the life of the window. That name is the md5 of the bytes, so
 * a thumbnail at a given name is that file and can never go stale — scrolling back up
 * should not re-fetch what it just had.
 */
const thumbnails = new Map<string, string>()

export async function thumbnailDataUrl(fileName: string): Promise<string> {
  const cached = thumbnails.get(fileName)
  if (cached) return cached

  const config = loadConfig()
  if (!config) return ''

  try {
    const url = `${config.supabaseUrl}/storage/v1/object/public/${THUMBNAILS_BUCKET}/${thumbnailPath(fileName)}`
    const response = await fetch(url)
    if (!response.ok) return ''

    const bytes = Buffer.from(await response.arrayBuffer())
    const dataUrl = `data:image/avif;base64,${bytes.toString('base64')}`
    thumbnails.set(fileName, dataUrl)
    return dataUrl
  } catch {
    return ''
  }
}
