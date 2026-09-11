import type { Board } from '@common/board'
import { deletePostRow, updatePostWithTags } from '@common/data/shared'
import { getPost, getPostTags, type Post } from '@common/data/posts'
import { postImagePath, thumbnailPath } from '@common/storage'
import { parseTagInput } from '@common/tags'
import { RATINGS, type Rating } from '@common/search'
import type { Tag } from '@common/tags'
import { boardDb } from './db'
import { boardStore } from './r2'
import { clearTagCache } from './tag-cache'
import { dropThumb, readThumb, writeThumb } from './thumb-cache'
import { boardImageUrl } from './config'

/**
 * Managing posts that already exist: load one, rewrite it, delete it.
 *
 * All three were server actions on the website, behind `requireUser()`. They are here
 * now because the website holds a role that may read and may touch one column — the
 * board is read-only from a browser, and this is the only program that can change it.
 *
 * The work itself is still `@common/data/shared`, the same functions the upload path
 * calls. What is added here is what the web actions added: the storage objects on the
 * way out, and the cached tag index on the way through.
 *
 * Every one of them takes the **board** the window is in, which is the table the row is
 * in and the prefix its two objects are under. It arrives with the call rather than being
 * held here: an edit begun on one board and finished after the mode was switched has to
 * land where it started, and a mode kept in this process is exactly how it would not.
 */

export type ManageOutcome = { ok: true } | { ok: false; error: string }

export type LoadedPost = {
  post: Post
  tags: Tag[]
}

export async function loadPost(id: number, board: Board = 'post'): Promise<LoadedPost | null> {
  const db = boardDb()
  if (!db) return null

  const post = await getPost(db, id, board)
  if (!post) return null
  return { post, tags: await getPostTags(db, id, board) }
}

/**
 * Rewrites a post's rating, source and whole tag set — the desktop's version of the
 * edit panel that used to sit on the post page.
 *
 * The tags arrive as the string the field renders, and are parsed with the same
 * `parseTagInput` an upload's are, so a name typed here and a name typed there cannot
 * differ in form. An unusable rating is refused rather than defaulted: silently writing
 * `general` over an R-18 post is the kind of quiet wrong answer that only shows up
 * on the public site.
 */
export async function savePost(
  id: number,
  rawTags: string,
  rawRating: string,
  sourceUrl: string,
  board: Board = 'post'
): Promise<ManageOutcome> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }

  // The stored code, straight from the editor's <select>, not the query spelling —
  // `asRating` is for the `rating:r18` a query carries, and this is not one.
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
    await updatePostWithTags(db, id, { rating, source_url: sourceUrl, tags }, board)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save the post.' }
  }

  // An edit can't coin a tag any more, but it moves post_counts, and the cached index
  // carries those.
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
export async function removePost(id: number, board: Board = 'post'): Promise<ManageOutcome> {
  const db = boardDb()
  if (!db) return { ok: false, error: 'Not set up yet' }

  const post = await getPost(db, id, board)
  if (!post) return { ok: false, error: `Post ${id} not found.` }

  try {
    await deletePostRow(db, id, board)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Delete failed.' }
  }

  // The row is already gone, so a storage failure is logged rather than reported: it
  // leaves two orphaned objects, which is untidy, and re-reporting it as a failed delete
  // would be wrong about the thing the user actually asked for.
  const store = boardStore()
  if (store) {
    await Promise.all([
      store
        .remove(postImagePath(post.file_name, post.file_ext, board))
        .catch((error: unknown) => console.error('Could not remove the post image:', error)),
      store
        .remove(thumbnailPath(post.file_name, board))
        .catch((error: unknown) => console.error('Could not remove the thumbnail:', error)),
    ])
  }

  // The cached copy on disk, which is otherwise the one thing that would still draw this
  // post — the name is the md5, so nothing will ever ask for it again either.
  thumbnails.delete(post.file_name)
  dropThumb(post.file_name)

  clearTagCache()
  return { ok: true }
}

/**
 * A thumbnail as a `data:` URL, for the browse grid.
 *
 * The window's CSP is `img-src 'self' data:` and stays that way. Fetching here costs an
 * IPC round trip per card, which for a screenful of a few dozen is nothing next to
 * loosening the one rule that says the page cannot reach the network. The bucket is
 * public, so this is a plain GET with no key on it — the same URL the website's grid uses.
 *
 * Cached by file name for the life of the window. That name is the md5 of the bytes, so
 * a thumbnail at a given name is that file and can never go stale — scrolling back up
 * should not re-fetch what it just had.
 *
 * **Both boards share the cache, and that is correct**: the name is the md5 of the
 * uploaded bytes and the thumbnail is what this app's encoder makes of them, so the same
 * image posted to both boards has the same thumbnail under the same name. Only the *fetch*
 * is per board, because the two are stored under different prefixes. What the sharing
 * costs is that deleting a post drops a thumbnail the other board may still be drawing —
 * one re-fetch, of a file a few kilobytes long.
 */
const thumbnails = new Map<string, string>()

/** Memory, then `app-cache/thumbs` (`main/thumb-cache.ts`), then the board — each step
 *  filling in the ones before it, and only the last one costing anything. */
export async function thumbnailDataUrl(fileName: string, board: Board = 'post'): Promise<string> {
  const cached = thumbnails.get(fileName)
  if (cached) return cached

  const stored = readThumb(fileName)
  if (stored) {
    thumbnails.set(fileName, stored)
    return stored
  }

  const url = boardImageUrl(thumbnailPath(fileName, board))
  if (!url) return ''

  try {
    const response = await fetch(url)
    if (!response.ok) return ''

    const bytes = Buffer.from(await response.arrayBuffer())
    writeThumb(fileName, bytes)
    const dataUrl = `data:image/avif;base64,${bytes.toString('base64')}`
    thumbnails.set(fileName, dataUrl)
    return dataUrl
  } catch {
    return ''
  }
}
