import type { Board } from '@common/board'
import {
  collectionImagePath,
  collectionThumbnailPath,
  imageUrl,
  postImagePath,
  thumbnailPath,
} from '@common/storage'
import { cdnBase } from '@/config'

/**
 * Where the website looks for an image — `@common/storage`'s path builders with this
 * host's base filled in.
 *
 * The base used to be read inside `@common/storage` itself, off
 * `NEXT_PUBLIC_SUPABASE_URL`, which broke the rule that nothing in `packages/common`
 * reads the environment (invariant 4) and quietly made a shared module part of one
 * host's configuration. It comes from `src/config.ts` now, and the desktop app supplies
 * its own from the value compiled into its bundle.
 *
 * No `server-only`: the grid's card is a client component, and `NEXT_PUBLIC_CDN_URL` is
 * inlined at build the way every public variable is. There is nothing secret about the
 * origin images are served from — it is in the markup of every page.
 */

export function postImageUrl(fileName: string, fileExt: string, board: Board = 'post'): string {
  return imageUrl(cdnBase(), postImagePath(fileName, fileExt, board))
}

export function thumbnailUrl(fileName: string, board: Board = 'post'): string {
  return imageUrl(cdnBase(), thumbnailPath(fileName, board))
}

/** The same two, for a collection's images — one more prefix in the same bucket. */
export function collectionImageUrl(fileName: string, fileExt: string): string {
  return imageUrl(cdnBase(), collectionImagePath(fileName, fileExt))
}

export function collectionThumbUrl(fileName: string): string {
  return imageUrl(cdnBase(), collectionThumbnailPath(fileName))
}
